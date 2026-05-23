"use client";

import * as React from "react";
import { ReactNode, useState, useEffect, ChangeEvent, forwardRef } from "react";
import { Check } from "lucide-react";

interface CheckboxProps extends React.InputHTMLAttributes<HTMLInputElement> {
  children?: ReactNode;
}

const Checkbox = forwardRef<HTMLInputElement, CheckboxProps>(
  (
    {
      checked: controlledChecked,
      defaultChecked,
      onChange,
      children,
      id,
      ...props
    },
    ref
  ) => {
    const [isChecked, setIsChecked] = useState(
      defaultChecked || controlledChecked || false
    );
    const checkboxId =
      id ||
      props.name ||
      `checkbox-${Math.random().toString(36).substring(2, 11)}`;

    useEffect(() => {
      if (controlledChecked !== undefined) {
        setIsChecked(controlledChecked);
      }
    }, [controlledChecked]);

    const handleChange = (e: ChangeEvent<HTMLInputElement>) => {
      const newChecked = e.target.checked;

      if (controlledChecked === undefined) {
        setIsChecked(newChecked);
      }
      if (onChange) {
        onChange(e);
      }
    };

    return (
      <div className="flex items-start">
        <input
          type="checkbox"
          id={checkboxId}
          checked={isChecked}
          onChange={handleChange}
          data-after="&#10003;"
          className="cursor-pointer font-semibold appearance-none w-4 h-4 p-0 m-0 flex justify-center items-center outline-0 border-1 border-[var(--border)] rounded-sm bg-[var(--background)] checked:bg-[var(--foreground)] checked:border-[var(--foreground)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--foreground)] disabled:cursor-not-allowed disabled:opacity-50 after:content-[attr(data-after)] after:text-xs after:opacity-0 after:text-xs checked:after:opacity-100 checked:after:text-[var(--background)]"
          ref={ref}
          {...props}
        />
        {children && <div className="ms-2 flex-1">{children}</div>}
      </div>
    );
  }
);
Checkbox.displayName = "Checkbox";

export { Checkbox };
