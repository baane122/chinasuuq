"use client";

interface FormInputProps {
  label: string;
  name: string;
  value: string | number;
  onChange: (value: string) => void;
  type?: "text" | "email" | "number" | "tel" | "url" | "date" | "password";
  placeholder?: string;
  required?: boolean;
  min?: number;
  step?: number;
  textarea?: boolean;
  rows?: number;
}

export default function FormInput({
  label,
  name,
  value,
  onChange,
  type = "text",
  placeholder,
  required,
  min,
  step,
  textarea,
  rows = 3,
}: FormInputProps) {
  const baseClass =
    "w-full rounded-xl border border-dark-200 bg-white px-3.5 py-2.5 text-sm text-dark-900 placeholder:text-dark-400 focus:outline-none focus:ring-2 focus:ring-brand-500/30 focus:border-brand-500 transition-all";

  return (
    <div className="space-y-1.5">
      <label htmlFor={name} className="block text-sm font-medium text-dark-700">
        {label}
        {required && <span className="text-red-500"> *</span>}
      </label>
      {textarea ? (
        <textarea
          id={name}
          name={name}
          rows={rows}
          value={value}
          onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => onChange(e.target.value)}
          placeholder={placeholder}
          required={required}
          className={`${baseClass} resize-none`}
        />
      ) : (
        <input
          id={name}
          name={name}
          type={type}
          value={value}
          onChange={(e: React.ChangeEvent<HTMLInputElement>) => onChange(e.target.value)}
          placeholder={placeholder}
          required={required}
          min={min}
          step={step}
          className={baseClass}
        />
      )}
    </div>
  );
}
