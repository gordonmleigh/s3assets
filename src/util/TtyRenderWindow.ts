import throttle from 'lodash.throttle';

export type TtyRenderFunction = (info: {
  columns?: number;
  rows?: number;
}) => string;

export type StringOrRenderFunction = string | TtyRenderFunction;

export interface TtyRenderWindowOptions {
  fps?: number;
  maxRows?: number;
  stream?: NodeJS.WriteStream;
}

export class TtyRenderWindow {
  private readonly maxRows: number;
  private readonly requestRender: () => void;
  private readonly stream: NodeJS.WriteStream;
  private ended = false;
  private lastRendered = 0;
  private rowText: StringOrRenderFunction[] = [];

  public get columns(): number {
    return this.stream.isTTY ? this.stream.columns ?? 80 : 0;
  }

  public get isVisible(): boolean {
    return !!this.stream.isTTY;
  }

  public get rows(): number {
    return this.stream.isTTY ? this.stream.rows ?? 24 : 0;
  }

  constructor({
    fps = 15,
    maxRows = Number.POSITIVE_INFINITY,
    stream = process.stdout,
  }: TtyRenderWindowOptions = {}) {
    this.requestRender = stream.isTTY
      ? throttle(this._renderNow, 1000 / fps, {
          leading: true,
          trailing: true,
        })
      : throttle(() => {}, 0); // eslint-disable-line @typescript-eslint/no-empty-function

    this.maxRows = maxRows;
    this.stream = stream;
  }

  public close(): void {
    if (this.stream.isTTY) {
      this.rowText.splice(0, this.rowText.length);
      this._renderNow();
    }
    this.ended = true;
  }

  public end(): void {
    if (this.stream.isTTY) {
      this._renderNow(true);

      if (this.rowText.length) {
        this.stream.write('\n');
      }
    }
    this.ended = true;
  }

  public interrupt(
    text: string | ((info: { columns?: number }) => string),
  ): void {
    if (typeof text === 'function') {
      text = text(this.stream);
    }
    if (this.stream.isTTY) {
      this.stream.cursorTo(0);
      for (const line of text.split('\n')) {
        this.stream.write(line + '\n');
        this.stream.clearLine(1);
      }
    } else {
      this.stream.write(text + '\n');
    }
    this.requestRender();
  }

  public render(rows: StringOrRenderFunction[]): void {
    this.rowText = rows;
    this.requestRender();
  }

  private readonly _renderNow = (noReset = false) => {
    if (!this.stream.isTTY || this.ended) {
      return;
    }

    const allowedRows = Math.min(this.maxRows, this.rows);
    let totalRows = 0;

    // write up to the maximum height of the terminal
    for (
      let i = 0;
      i < this.rowText.length && i < allowedRows;
      ++i, ++totalRows
    ) {
      if (i > 0) {
        this.stream.write('\n');
      } else {
        this.stream.cursorTo(0);
      }

      let text = this.rowText[i];
      if (typeof text === 'function') {
        text = text(this.stream);
      }
      this.stream.write(text);
      this.stream.clearLine(1);
    }

    const diff = this.lastRendered - this.rowText.length;
    this.lastRendered = totalRows;

    // clear previously written rows
    for (let i = 0; i < diff && totalRows < allowedRows; ++i, ++totalRows) {
      if (totalRows > 0) {
        this.stream.write('\n');
      } else {
        this.stream.cursorTo(0);
      }
      this.stream.clearLine(1);
    }

    if (!noReset) {
      if (totalRows > 0) {
        this.stream.moveCursor(0, -(totalRows - 1));
      }
    } else if (diff > 0) {
      this.stream.moveCursor(0, -diff);
    }
  };
}
