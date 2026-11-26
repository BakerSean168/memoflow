// Adapted from T3 Code f9b19a7f8 (MIT); see THIRD_PARTY_NOTICES.md.
export function nextOrderedMarkerText(marker: string): string {
  const numberText = marker.slice(0, -1);
  const delimiter = marker.slice(-1);
  const number = Number.parseInt(numberText, 10);
  const next = Number.isSafeInteger(number)
    ? String(number + 1).padStart(numberText.length, '0')
    : numberText;
  return `${next}${delimiter}`;
}
