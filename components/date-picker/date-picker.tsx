"use client";

import * as React from "react";
import { format } from "date-fns";
import { CalendarIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";

interface DatePickerProps {
  value?: Date | string | null;
  onChange?: (date: Date | undefined) => void;
  className?: string;
  placeholder?: string;
}

export default function DatePicker({
  value,
  onChange,
  className,
  placeholder = "Pick a date",
}: DatePickerProps) {
  // Normalise to Date | undefined — Calendar's mode="single" expects Date,
  // not a raw string. Passing a string causes `.getMonth()` to fail inside
  // the year-grid year button onClick handler.
  const dateValue = React.useMemo(() => {
    if (!value) return undefined;
    if (value instanceof Date) return value;
    const parsed = new Date(value);
    return isNaN(parsed.getTime()) ? undefined : parsed;
  }, [value]);

  return (
    <Popover>
      <PopoverTrigger
        render={
          <Button
            variant="outline"
            className={cn(
              "w-[240px] justify-start text-left font-normal",
              !dateValue && "text-muted-foreground",
              className
            )}
          />
        }
      >
        <CalendarIcon className="mr-2 h-4 w-4" />
        {dateValue ? format(dateValue, "PPP") : <span>{placeholder}</span>}
      </PopoverTrigger>

      <PopoverContent className="w-auto p-0" align="start">
        <Calendar
          mode="single"
          selected={dateValue}
          onSelect={(date) => {
            onChange?.(date);
          }}
          autoFocus
        />
      </PopoverContent>
    </Popover>
  );
}
