function StatusBadge({ color }) {
  const styles = {
    green: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400",
    orange: "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400",
    red: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
  };

  const labels = {
    green: "OK",
    orange: "Warning",
    red: "Critical",
  };

  const cls = styles[color] || styles.green;
  const label = labels[color] || "OK";

  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium ${cls}`}
      data-testid={`badge-status-${color}`}
    >
      <span
        className={`inline-block h-1.5 w-1.5 rounded-full ${
          color === "green"
            ? "bg-green-500"
            : color === "orange"
            ? "bg-orange-500"
            : "bg-red-500"
        }`}
      />
      {label}
    </span>
  );
}

export default StatusBadge;
