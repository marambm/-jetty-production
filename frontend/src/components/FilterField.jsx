import { ui } from "./uiStyles";

function FilterField({ label, children, className = "" }) {
  return (
    <div className={`flex flex-col gap-1 min-w-[180px] flex-1 ${className}`}>
      {label && <span className={ui.label}>{label}</span>}
      {children}
    </div>
  );
}

export default FilterField;
