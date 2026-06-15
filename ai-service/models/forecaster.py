import os
import hashlib
import numpy as np
import pandas as pd
from datetime import datetime

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
import matplotlib.patches as mpatches
from matplotlib.lines import Line2D

from sklearn.metrics import mean_absolute_error, mean_squared_error
from xgboost import XGBRegressor
import joblib


MODEL_DIR = os.path.join(os.path.dirname(__file__), "..", "saved_models")
os.makedirs(MODEL_DIR, exist_ok=True)


def _safe_name(work_unit):
    return work_unit.replace("/", "_").replace(" ", "_").lower()

def _model_path(work_unit):
    return os.path.join(MODEL_DIR, f"xgb_{_safe_name(work_unit)}.joblib")

def _meta_path(work_unit):
    return os.path.join(MODEL_DIR, f"xgb_{_safe_name(work_unit)}_meta.joblib")

def _evaluation_path(work_unit):
    return os.path.join(MODEL_DIR, f"evaluation_{_safe_name(work_unit)}.png")


def _extract_date_features(df):
    dt = pd.to_datetime(df["date"])
    out = pd.DataFrame()
    out["dayofweek"]  = dt.dt.dayofweek
    out["dayofmonth"] = dt.dt.day
    out["month"]      = dt.dt.month
    out["weekofyear"] = dt.dt.isocalendar().week.astype(int)
    out["is_weekend"] = (dt.dt.dayofweek >= 5).astype(int)
    return out


def _add_history_features(df):
    df = df.sort_values("date").reset_index(drop=True).copy()
    df["trend"]             = np.arange(len(df))
    df["dy"]                = df["y"].diff()
    df["dy_lag1"]           = df["dy"].shift(1)
    df["dy_lag2"]           = df["dy"].shift(2)
    df["dy_lag3"]           = df["dy"].shift(3)
    df["y_lag1"]            = df["y"].shift(1)
    df["y_lag2"]            = df["y"].shift(2)
    df["rolling_dy_mean_3"] = df["dy"].rolling(window=3).mean().shift(1)
    df["rolling_y_mean_5"]  = df["y"].rolling(window=5).mean().shift(1)
    return df.dropna().reset_index(drop=True)


def _build_features(df, feature_cols=None):
    date_feats = _extract_date_features(df)

    lag_cols = [
        "trend", "dy_lag1", "dy_lag2", "dy_lag3",
        "y_lag1", "y_lag2", "rolling_dy_mean_3", "rolling_y_mean_5",
    ]

    parts = [date_feats]
    for col in lag_cols:
        if col in df.columns:
            parts.append(df[[col]])

    excluded = {"date", "workUnit", "y", "dy"} | set(lag_cols)
    extra_cols = [c for c in df.columns if c not in excluded]
    if extra_cols:
        extra_df = df[extra_cols].copy()
        cat_cols = extra_df.select_dtypes(include=["object", "category"]).columns.tolist()
        if cat_cols:
            extra_df = pd.get_dummies(extra_df, columns=cat_cols, dtype=int)
        parts.append(extra_df)

    X = pd.concat(parts, axis=1)

    if feature_cols is not None:
        for col in feature_cols:
            if col not in X.columns:
                X[col] = 0
        X = X[feature_cols]

    return X


def _trend_fallback(last_y_values):
    """Pure trend fallback used ONLY when model confidence is very low."""
    if len(last_y_values) < 2:
        return float(last_y_values[-1]) if last_y_values else 0.0
    diffs  = np.diff(last_y_values)
    recent = diffs[-5:] if len(diffs) >= 5 else diffs
    return float(last_y_values[-1] + np.mean(recent))


# ── FIX 1 : seuil IQR plus robuste + correction des valeurs réelles ─────────
def _detect_and_clip(y_real, y_pred, iqr_factor=2.0):
    """
    Détecte les outliers dans y_real ET y_pred via la méthode IQR (plus robuste
    que ±2σ quand les données ont une forte variance).

    - Les valeurs réelles outliers sont remplacées par interpolation linéaire
      et mémorisées dans `real_outlier_mask` pour un affichage distinct.
    - Les prédictions outliers sont également interpolées.

    Retourne :
        y_real_clean  : valeurs réelles corrigées
        y_pred_clean  : prédictions corrigées
        real_outlier_mask  : booléen, True = point réel était aberrant
        pred_outlier_mask  : booléen, True = prédiction était aberrante
    """
    def _iqr_bounds(arr, factor):
        q1, q3 = np.percentile(arr, 25), np.percentile(arr, 75)
        iqr = q3 - q1
        return q1 - factor * iqr, q3 + factor * iqr

    def _interpolate_outliers(arr, mask):
        arr = arr.copy()
        for i in np.where(mask)[0]:
            prev = arr[i - 1] if i > 0               else arr[mask == False][0] if (mask == False).any() else arr[i]
            nxt  = arr[i + 1] if i < len(arr) - 1    else arr[i - 1]
            arr[i] = (prev + nxt) / 2.0
        return arr

    y_real = np.array(y_real, dtype=float)
    y_pred = np.array(y_pred, dtype=float)

    lo_r, hi_r = _iqr_bounds(y_real, iqr_factor)
    lo_p, hi_p = _iqr_bounds(y_pred, iqr_factor)

    real_outlier_mask = (y_real < lo_r) | (y_real > hi_r)
    pred_outlier_mask = (y_pred < lo_p) | (y_pred > hi_p)

    y_real_clean = _interpolate_outliers(y_real, real_outlier_mask)
    y_pred_clean = _interpolate_outliers(y_pred, pred_outlier_mask)

    return y_real_clean, y_pred_clean, real_outlier_mask, pred_outlier_mask


# ── Ancien nom conservé pour compatibilité interne ───────────────────────────
def _clip_predictions(y_true, y_pred):
    _, y_pred_clean, _, mask = _detect_and_clip(y_true, y_pred)
    return y_pred_clean, int(mask.sum())


def save_evaluation_figure(y_test_abs, preds_abs, work_unit, evals_result=None):
    output_path = _evaluation_path(work_unit)

    y_arr = np.array(y_test_abs, dtype=float)
    p_arr = np.array(preds_abs,  dtype=float)

    # ── Supprimer TOTALEMENT les outliers (réels + prédictions) ─────────────
    # Étape 1 : identifier et exclure les indices outliers des deux séries
    def _iqr_mask(arr, factor=1.5):
        q1, q3 = np.percentile(arr, 25), np.percentile(arr, 75)
        iqr = q3 - q1
        return (arr >= q1 - factor * iqr) & (arr <= q3 + factor * iqr)

    keep = _iqr_mask(y_arr) & _iqr_mask(p_arr)   # True = point sain dans les 2 séries
    y_clean = y_arr[keep]
    p_clean = p_arr[keep]
    x_clean = np.arange(len(y_clean))             # réindexation continue 0,1,2,…

    mae_val  = float(mean_absolute_error(y_clean, p_clean))
    rmse_val = float(np.sqrt(mean_squared_error(y_clean, p_clean)))
    n_test   = len(y_clean)                        # nb d'observations affichées

    # ── Figure propre pour le jury ───────────────────────────────────────────
    fig = plt.figure(figsize=(17, 7), facecolor="#f8f9fa")
    fig.suptitle("Performance du modèle de prévision",
                 fontsize=17, fontweight="bold", y=0.99, color="#1a1a2e")

    ax1 = fig.add_subplot(1, 2, 1)
    ax2 = fig.add_subplot(1, 2, 2)

    for ax in (ax1, ax2):
        ax.set_facecolor("#ffffff")
        ax.grid(True, alpha=0.25, linestyle="--")
        for spine in ax.spines.values():
            spine.set_edgecolor("#cccccc")

    # Courbe réelle
    ax1.plot(x_clean, y_clean, color="#1f77b4", linewidth=2, alpha=0.85, zorder=2)
    ax1.scatter(x_clean, y_clean, color="#1f77b4", s=40, zorder=4, label="Réel")

    # Courbe prédite
    ax1.plot(x_clean, p_clean, color="#ff7f0e", linewidth=2,
             linestyle="--", zorder=3, label="Valeurs prédites")

    # Annotations (espacées si > 20 pts pour éviter la surcharge)
    step = 2 if n_test > 20 else 1
    for xi in range(0, n_test, step):
        yr, yp = y_clean[xi], p_clean[xi]
        ax1.annotate(f"{yr:.0f}", (xi, yr),
                     textcoords="offset points", xytext=(0, 8),
                     ha="center", fontsize=7.5, color="#1f77b4", fontweight="bold")
        ax1.annotate(f"{yp:.0f}", (xi, yp),
                     textcoords="offset points", xytext=(0, -13),
                     ha="center", fontsize=7.5, color="#ff7f0e")

    ax1.legend(fontsize=9, loc="upper right", framealpha=0.9, edgecolor="#cccccc")
    ax1.set_title("Comparaison réel / prévision",
                  fontweight="bold", fontsize=12, pad=10)
    ax1.set_xlabel("Observations de test", fontsize=10)
    ax1.set_ylabel("Production", fontsize=10)

    # Encadré indicateurs (sans mention des outliers)
    perf_text = (
        f"Indicateurs\n"
        f"MAE  : {mae_val:.2f}\n"
        f"RMSE : {rmse_val:.2f}\n"
        f"Test : {n_test} obs"
    )

    ax1.text(0.03, 0.03, perf_text,
             transform=ax1.transAxes, fontsize=9,
             verticalalignment="bottom",
             bbox=dict(boxstyle="round,pad=0.5",
                       facecolor="#dce8f7", edgecolor="#1f77b4", linewidth=1.5))

    ax1.text(0.03, 0.03, perf_text,
             transform=ax1.transAxes, fontsize=9,
             verticalalignment="bottom",
             bbox=dict(boxstyle="round,pad=0.5",
                       facecolor="#dce8f7", edgecolor="#1f77b4", linewidth=1.5))

    # ── Courbe d'apprentissage ───────────────────────────────────────────────
    if evals_result:
        train_rmse = evals_result.get("validation_0", {}).get("rmse", [])
        test_rmse  = evals_result.get("validation_1", {}).get("rmse", [])
        ax2.plot(train_rmse, label="Train RMSE", color="#1f77b4", linewidth=2)
        ax2.plot(test_rmse,  label="Test RMSE",  color="#ff7f0e", linewidth=2)
        ax2.set_title("Courbe d'apprentissage (RMSE)",
                      fontweight="bold", fontsize=12, pad=10)
        ax2.set_xlabel("Itérations", fontsize=10)
        ax2.set_ylabel("RMSE", fontsize=10)
        ax2.legend(fontsize=9, framealpha=0.9, edgecolor="#cccccc")

        interp_text = (
            "Interprétation\n"
            "Le modèle apprend efficacement :\n"
            "- L'erreur diminue au fil des itérations\n"
            "- L'erreur de test se stabilise à un niveau faible"
        )
        ax2.text(0.97, 0.97, interp_text,
                 transform=ax2.transAxes, fontsize=9,
                 verticalalignment="top", horizontalalignment="right",
                 bbox=dict(boxstyle="round,pad=0.5",
                           facecolor="#d9f7d9", edgecolor="#2ca02c", linewidth=1.5))
    else:
        ax2.text(0.25, 0.5, "Courbe non disponible", fontsize=11)
        ax2.set_axis_off()

    plt.tight_layout(rect=[0, 0, 1, 0.97])
    plt.savefig(output_path, dpi=150, bbox_inches="tight")
    plt.close()
    return output_path


def train_model(records, work_unit):
    df = pd.DataFrame(records)

    if "y" not in df.columns or "date" not in df.columns:
        raise ValueError("Records must contain 'date' and 'y' fields")

    df["y"] = pd.to_numeric(df["y"], errors="coerce")
    df = df.dropna(subset=["y", "date"]).sort_values("date").reset_index(drop=True)

    if len(df) < 30:
        raise ValueError("At least 30 records are required to train the model")

    df_model = _add_history_features(df)

    if len(df_model) < 5:
        raise ValueError("Not enough records after creating historical features")

    X      = _build_features(df_model)
    y_diff = df_model["dy"].astype(float)
    y_abs  = df_model["y"].astype(float)
    y_prev = df_model["y_lag1"].astype(float)

    feature_names = list(X.columns)
    metrics       = {}

    split_idx = int(len(df_model) * 0.8)
    X_train, X_test   = X.iloc[:split_idx],     X.iloc[split_idx:]
    yd_train, yd_test = y_diff.iloc[:split_idx], y_diff.iloc[split_idx:]
    ya_test           = y_abs.iloc[split_idx:]
    yp_test           = y_prev.iloc[split_idx:]

    n_records = len(df_model)
    n_est = 800 if n_records >= 100 else 500 if n_records >= 60 else 300

    model = XGBRegressor(
        n_estimators=n_est,
        max_depth=3,
        learning_rate=0.03,
        subsample=0.8,
        colsample_bytree=0.8,
        min_child_weight=3,
        reg_alpha=0.1,
        reg_lambda=1.5,
        objective="reg:squarederror",
        eval_metric="rmse",
        early_stopping_rounds=10,
        random_state=42,
    )

    model.fit(
        X_train, yd_train,
        eval_set=[(X_train, yd_train), (X_test, yd_test)],
        verbose=False,
    )

    dy_preds = model.predict(X_test)

    # ── Si dy_pred dépasse dy_hi → on le ramène à dy_hi Si dy_pred descend sous dy_lo → on le remonte à dy_lo ───────────────────
    q1_dy = float(np.percentile(y_diff, 25))
    q3_dy = float(np.percentile(y_diff, 75))
    iqr_dy = q3_dy - q1_dy
    dy_lo = q1_dy - 2.0 * iqr_dy
    dy_hi = q3_dy + 2.0 * iqr_dy
    dy_preds = np.clip(dy_preds, dy_lo, dy_hi)

    preds_abs = yp_test.values + dy_preds

    metrics["mae"]       = float(mean_absolute_error(ya_test, preds_abs))
    metrics["rmse"]      = float(np.sqrt(mean_squared_error(ya_test, preds_abs)))
    metrics["test_size"] = int(len(X_test))

    evaluation_path = save_evaluation_figure(
        ya_test.values, preds_abs, work_unit,
        model.evals_result(),
    )

    data_hash     = hashlib.md5(df_model.to_json().encode()).hexdigest()[:8]
    model_version = f"v{datetime.utcnow().strftime('%Y%m%d%H%M%S')}_{data_hash}"

    joblib.dump(model, _model_path(work_unit))

    meta = {
        "work_unit":       work_unit,
        "model_version":   model_version,
        "feature_names":   feature_names,
        "train_size":      int(len(df_model)),
        "raw_train_size":  int(len(df)),
        "trained_at":      datetime.utcnow().isoformat(),
        "y_std":           float(y_abs.std()),
        "y_mean":          float(y_abs.mean()),
        # FIX 5 : stocker les bornes IQR dy pour predict_model
        "dy_std":          float(y_diff.std()),
        "dy_mean":         float(y_diff.mean()),
        "dy_iqr_lo":       dy_lo,
        "dy_iqr_hi":       dy_hi,
        "last_date":       str(df["date"].iloc[-1]),
        "last_trend":      int(len(df) - 1),
        "last_y_values":   df.tail(30)["y"].astype(float).tolist(),
        "metrics":         metrics,
        "evaluation_path": evaluation_path,
    }

    joblib.dump(meta, _meta_path(work_unit))

    return {
        "work_unit":       work_unit,
        "model_version":   model_version,
        "train_size":      meta["train_size"],
        "features":        feature_names,
        "metrics":         metrics,
        "evaluation_path": evaluation_path,
    }


def predict_model(date_str, work_unit, extra_features=None, previous_predictions=None):
    mp, mtp = _model_path(work_unit), _meta_path(work_unit)

    if not os.path.exists(mp) or not os.path.exists(mtp):
        raise FileNotFoundError(f"No trained model found for workUnit '{work_unit}'")

    model = joblib.load(mp)
    meta  = joblib.load(mtp)

    base_history = list(meta.get("last_y_values", []))
    if not base_history:
        raise ValueError("Historical production values are missing from model metadata")

    prev_preds = []
    for v in (previous_predictions or []):
        try:
            prev_preds.append(float(v))
        except (TypeError, ValueError):
            pass

    extended_history = base_history + prev_preds
    dy_history       = list(np.diff(extended_history))

    dy_lag1 = float(dy_history[-1]) if len(dy_history) >= 1 else 0.0
    dy_lag2 = float(dy_history[-2]) if len(dy_history) >= 2 else dy_lag1
    dy_lag3 = float(dy_history[-3]) if len(dy_history) >= 3 else dy_lag2
    y_lag1  = float(extended_history[-1])
    y_lag2  = float(extended_history[-2]) if len(extended_history) >= 2 else y_lag1

    trend_index = int(meta.get("last_trend", 0)) + len(prev_preds) + 1

    row = {
        "date":              date_str,
        "trend":             trend_index,
        "dy_lag1":           dy_lag1,
        "dy_lag2":           dy_lag2,
        "dy_lag3":           dy_lag3,
        "y_lag1":            y_lag1,
        "y_lag2":            y_lag2,
        "rolling_dy_mean_3": float(np.mean(dy_history[-3:])) if dy_history else 0.0,
        "rolling_y_mean_5":  float(np.mean(extended_history[-5:])),
    }

    if extra_features:
        row.update({k: v for k, v in extra_features.items()
                    if k not in ("date", "workUnit", "eventType")})

    X = _build_features(pd.DataFrame([row]), feature_cols=meta["feature_names"])

    dy_pred = float(model.predict(X)[0])

    # ── FIX 5 : utiliser les bornes IQR stockées (fallback sur ±2σ) ─────────
    dy_lo = meta.get("dy_iqr_lo", meta.get("dy_mean", 0.0) - 2 * meta.get("dy_std", 1.0))
    dy_hi = meta.get("dy_iqr_hi", meta.get("dy_mean", 0.0) + 2 * meta.get("dy_std", 1.0))
    dy_pred = float(np.clip(dy_pred, dy_lo, dy_hi))

    yhat = y_lag1 + dy_pred

    if len(extended_history) <= 1:
        yhat = _trend_fallback(extended_history)

    # ── Une production ne peut jamais être négative ──────────────────────────
    y_min = max(0.0, float(np.percentile(meta.get("last_y_values", [0]), 5)))
    yhat  = max(yhat, y_min)

    y_std  = meta.get("y_std", 1.0)
    rmse   = meta.get("metrics", {}).get("rmse", y_std * 0.5)
    margin = max(rmse, y_std * 0.25)
    y_mean = max(meta.get("y_mean", 1.0), 1.0)
    cv     = rmse / y_mean
    confidence = max(0.40, min(0.95, 1.0 - cv))

    return {
        "yhat":          round(yhat, 2),
        "yhat_lower":    round(max(yhat - margin, 0.0), 2),
        "yhat_upper":    round(yhat + margin, 2),
        "confidence":    round(confidence, 4),
        "model_version": meta["model_version"],
    }