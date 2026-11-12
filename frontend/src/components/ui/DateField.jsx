// A date field in Portuguese, in place of <TextField type="date">. The browser's own date input follows the
// browser's language (often English) and the app can't change it; this one always shows dd/MM/yyyy and a
// calendar in pt-PT where the day is picked with a click.
//
// It keeps the contract of the native input so it drops into the existing forms: `value` is a 'YYYY-MM-DD'
// string ('' when empty), and `onChange` gets an event-like `{ target: { name, value } }` with the same
// string. `inputProps.min` / `inputProps.max` ('YYYY-MM-DD') become the picker's minDate / maxDate.

import React from 'react';
import { DatePicker } from '@mui/x-date-pickers/DatePicker';
import { format, isValid, parseISO } from 'date-fns';

const toDate = (text) => {
    if (!text) return null;
    const date = parseISO(text);
    return isValid(date) ? date : null;
};

export default function DateField({
    value, onChange, name, label, inputProps, disabled, required, error, helperText, fullWidth, size,
}) {
    const handleChange = (date) => {
        // While the user is typing, the date is invalid until the year is complete: keep the field empty then.
        const text = date && isValid(date) ? format(date, 'yyyy-MM-dd') : '';
        onChange?.({ target: { name, value: text } });
    };

    return (
        <DatePicker
            label={label}
            value={toDate(value)}
            onChange={handleChange}
            disabled={disabled}
            minDate={toDate(inputProps?.min) ?? undefined}
            maxDate={toDate(inputProps?.max) ?? undefined}
            format="dd/MM/yyyy"
            slotProps={{
                textField: { name, required, error, helperText, fullWidth, size },
            }}
        />
    );
}
