import { useState, useRef, useEffect } from "react";
import { format, parse, isValid, getDaysInMonth, startOfMonth, getDay } from "date-fns";
import { fr } from "date-fns/locale";
import { CalendarDays, ChevronLeft, ChevronRight } from "lucide-react";

const MONTHS_SHORT = ["Jan","Fév","Mar","Avr","Mai","Jun","Jul","Aoû","Sep","Oct","Nov","Déc"];
const MONTHS_LONG  = ["Janvier","Février","Mars","Avril","Mai","Juin","Juillet","Août","Septembre","Octobre","Novembre","Décembre"];
const DAY_NAMES    = ["Lu","Ma","Me","Je","Ve","Sa","Di"];

function CalendarPicker({ value, onChange, label, testId = "input-date" }) {
  const today = new Date();

  const parsed = value ? parse(value, "yyyy-MM-dd", new Date()) : null;
  const validParsed = parsed && isValid(parsed) ? parsed : null;

  const [open, setOpen]   = useState(false);
  const [viewYear,  setViewYear]  = useState(validParsed ? validParsed.getFullYear()  : today.getFullYear());
  const [viewMonth, setViewMonth] = useState(validParsed ? validParsed.getMonth()     : today.getMonth());
  const containerRef = useRef(null);

  const displayValue = validParsed ? format(validParsed, "dd/MM/yyyy") : "";

  useEffect(() => {
    function onOutside(e) {
      if (containerRef.current && !containerRef.current.contains(e.target)) setOpen(false);
    }
    if (open) {
      document.addEventListener("mousedown", onOutside);
      return () => document.removeEventListener("mousedown", onOutside);
    }
  }, [open]);

  function prevMonth() {
    if (viewMonth === 0) { setViewMonth(11); setViewYear(y => y - 1); }
    else setViewMonth(m => m - 1);
  }
  function nextMonth() {
    if (viewMonth === 11) { setViewMonth(0); setViewYear(y => y + 1); }
    else setViewMonth(m => m + 1);
  }
  function selectMonth(m) { setViewMonth(m); }

  function handleDayClick(day) {
    const date = new Date(viewYear, viewMonth, day);
    onChange(format(date, "yyyy-MM-dd"));
    setOpen(false);
  }

  /* Build day grid */
  function buildDays() {
    const firstDow = getDay(startOfMonth(new Date(viewYear, viewMonth, 1)));
    const offset   = firstDow === 0 ? 6 : firstDow - 1; // Monday-first
    const total    = getDaysInMonth(new Date(viewYear, viewMonth, 1));
    const prevTotal = getDaysInMonth(new Date(viewYear, viewMonth === 0 ? 11 : viewMonth - 1, 1));
    const cells = [];

    for (let i = 0; i < offset; i++)
      cells.push({ day: prevTotal - offset + 1 + i, type: "prev" });
    for (let d = 1; d <= total; d++)
      cells.push({ day: d, type: "current" });
    const remaining = (7 - (cells.length % 7)) % 7;
    for (let i = 1; i <= remaining; i++)
      cells.push({ day: i, type: "next" });
    return cells;
  }

  const isSelected = (day, type) =>
    type === "current" &&
    validParsed &&
    validParsed.getFullYear() === viewYear &&
    validParsed.getMonth()   === viewMonth &&
    validParsed.getDate()    === day;

  const isToday = (day, type) =>
    type === "current" &&
    today.getFullYear() === viewYear &&
    today.getMonth()   === viewMonth &&
    today.getDate()    === day;

  return (
    <div className="relative" ref={containerRef}>
      {label && (
        <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">{label}</label>
      )}

      {/* Trigger button */}
      <button
        type="button"
        onClick={() => setOpen(p => !p)}
        data-testid={testId}
        className="h-11 flex items-center gap-2 px-3.5 w-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-sm text-slate-900 dark:text-slate-200 hover:border-indigo-400 dark:hover:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all"
      >
        <CalendarDays className="w-4 h-4 text-indigo-500 dark:text-indigo-400 flex-shrink-0" />
        <span className={displayValue ? "font-medium" : "text-gray-400 dark:text-slate-500"}>
          {displayValue || "DD/MM/YYYY"}
        </span>
      </button>

      {/* Popover */}
      {open && (
        <div
          data-testid="calendar-popover"
          className="absolute top-full left-0 mt-2 z-50 bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-700 rounded-2xl shadow-xl p-4 animate-in fade-in slide-in-from-top-1"
          style={{ minWidth: 288 }}
        >
          {/* Header */}
          <div className="flex items-center justify-between mb-4">
            <span className="text-base font-semibold text-gray-900 dark:text-slate-100">
              {MONTHS_LONG[viewMonth]} {viewYear}
            </span>
            <div className="flex gap-2">
              <button
                onClick={prevMonth}
                aria-label="Mois précédent"
                className="w-8 h-8 rounded-lg flex items-center justify-center bg-indigo-500 hover:bg-indigo-600 text-white transition-colors"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <button
                onClick={nextMonth}
                aria-label="Mois suivant"
                className="w-8 h-8 rounded-lg flex items-center justify-center bg-indigo-500 hover:bg-indigo-600 text-white transition-colors"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Day-name row */}
          <div className="grid grid-cols-7 mb-1">
            {DAY_NAMES.map(d => (
              <div key={d} className="text-center text-[11px] font-semibold uppercase text-gray-400 dark:text-slate-500 py-1">
                {d}
              </div>
            ))}
          </div>

          {/* Day cells */}
          <div className="grid grid-cols-7 gap-y-1">
            {buildDays().map((cell, i) => (
              <button
                key={i}
                onClick={() => cell.type === "current" && handleDayClick(cell.day)}
                disabled={cell.type !== "current"}
                className={[
                  "aspect-square flex items-center justify-center text-sm rounded-lg transition-colors",
                  cell.type !== "current"
                    ? "text-gray-300 dark:text-slate-600 cursor-default"
                    : isSelected(cell.day, cell.type)
                    ? "bg-indigo-500 text-white font-semibold"
                    : isToday(cell.day, cell.type)
                    ? "ring-1 ring-indigo-400 text-indigo-500 dark:text-indigo-400 font-bold hover:bg-indigo-50 dark:hover:bg-indigo-900/20"
                    : "text-gray-700 dark:text-slate-300 hover:bg-indigo-50 dark:hover:bg-indigo-900/20",
                ].join(" ")}
              >
                {cell.day}
              </button>
            ))}
          </div>

          {/* Month strip */}
          <div className="flex items-end justify-between mt-4 pt-3 border-t border-gray-100 dark:border-slate-800">
            {MONTHS_SHORT.map((m, i) => (
              <button
                key={m}
                onClick={() => selectMonth(i)}
                className="flex flex-col items-center gap-1 group"
                aria-label={MONTHS_LONG[i]}
              >
                <span className={`text-[10px] font-medium ${
                  i === viewMonth
                    ? "text-indigo-500 dark:text-indigo-400"
                    : "text-gray-400 dark:text-slate-500 group-hover:text-gray-600 dark:group-hover:text-slate-300"
                }`}>
                  {m}
                </span>
                <span className={`rounded-full transition-all ${
                  i === viewMonth
                    ? "w-3 h-3 bg-indigo-500"
                    : "w-2.5 h-2.5 border border-gray-300 dark:border-slate-600 group-hover:border-indigo-400"
                }`} />
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export default CalendarPicker;