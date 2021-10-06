export function progressBar(value: number): (width: number) => string;
export function progressBar(value: number, width: number): string;
export function progressBar(
  value: number,
  width?: number,
): string | ((width: number) => string) {
  function render(width: number) {
    const progress = Number.isNaN(value) ? 0 : Math.floor(value * width);
    const rest = width - progress;
    return ''.padEnd(progress, '█') + ''.padEnd(rest, '░');
  }
  if (width === undefined) {
    return render;
  }
  return render(width);
}
