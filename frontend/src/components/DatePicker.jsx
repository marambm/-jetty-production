function DatePicker({ value, onChange }) {
  return (
    <input
      type="date"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="border border-gray-300 dark:border-slate-700 rounded-md px-3 py-2 text-sm text-gray-700 dark:text-slate-200 bg-white dark:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
      data-testid="input-date"
    />
  );
}

export default DatePicker;
