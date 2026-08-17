export type DatePickerKeyEvent = {
  key: string;
  preventDefault: () => void;
};

export function handleDatePickerConfirmKey(
  event: DatePickerKeyEvent,
  confirm: () => void,
): boolean {
  if (event.key !== "Enter") return false;
  event.preventDefault();
  confirm();
  return true;
}
