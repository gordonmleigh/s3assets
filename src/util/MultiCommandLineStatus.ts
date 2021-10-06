import throttle from 'lodash.throttle';
import { CommandLineStatusRow } from './CommandLineStatusRow';
import { StringOrRenderFunction, TtyRenderWindow } from './TtyRenderWindow';

export interface CommandLineStatusOptions {
  fps?: number;
  maxDisplayedRows?: number;
  overflowText?: (hidden: number, total: number) => string | undefined;
  stream?: NodeJS.WriteStream;
}

export class MultiCommandLineStatusRow implements CommandLineStatusRow {
  private _ended = false;
  private _status: StringOrRenderFunction = '';

  public get ended(): boolean {
    return this._ended;
  }

  public get status(): StringOrRenderFunction {
    return this._status;
  }
  public set status(value: StringOrRenderFunction) {
    if (this._status !== value) {
      this._status = value;
      this.parent.render();
    }
  }

  constructor(private readonly parent: MultiCommandLineStatus) {}

  public close(): void {
    this.parent.removeRow(this);
  }

  public end(text?: StringOrRenderFunction): void {
    if (text) {
      this.status = text;
    }
    this._ended = true;
  }

  public interrupt(text: StringOrRenderFunction): void {
    this.parent.interrupt(text);
  }

  public render(): void {
    this.parent.render();
  }
}

export class MultiCommandLineStatus {
  private readonly _requestRender: (() => void) & { flush(): void };
  private _status: StringOrRenderFunction | undefined;
  private readonly maxDisplayedRows: number | undefined;
  private readonly overflowText?: (
    hidden: number,
    total: number,
  ) => string | undefined;
  private readonly rows: MultiCommandLineStatusRow[] = [];
  private readonly window: TtyRenderWindow;
  private ended = false;

  public get status(): StringOrRenderFunction | undefined {
    return this._status;
  }
  public set status(value: StringOrRenderFunction | undefined) {
    if (this._status !== value) {
      this._status = value;
      this.render();
    }
  }

  constructor({
    stream,
    fps = 15,
    maxDisplayedRows,
    overflowText,
  }: CommandLineStatusOptions = {}) {
    this._requestRender = throttle(this._renderNow, 1000 / fps, {
      leading: true,
      trailing: true,
    });

    this.maxDisplayedRows = maxDisplayedRows;
    this.overflowText = overflowText;

    this.window = new TtyRenderWindow({
      fps,
      stream,
    });
  }

  public addRow(): CommandLineStatusRow {
    const row = new MultiCommandLineStatusRow(this);
    this.rows.push(row);
    return row;
  }

  public close(): void {
    this.rows.splice(0, this.rows.length);
    this.window.close();
    this.ended = true;
  }

  public end(): void {
    this._requestRender.flush();
    this._renderNow();
    this.window.end();
    this.ended = true;
  }

  public removeRow(row: CommandLineStatusRow): void {
    const ownRow = row as MultiCommandLineStatusRow;
    const index = this.rows.indexOf(ownRow);
    if (index < 0) {
      return;
    }
    this.rows.splice(index, 1);
    this.render();
  }

  public interrupt(text: StringOrRenderFunction): void {
    this.window.interrupt(text);
  }

  public render(): void {
    this._requestRender();
  }

  private readonly _renderNow = () => {
    if (this.ended) {
      return;
    }
    let ended = 0;

    for (; ended < this.rows.length && this.rows[ended].ended; ++ended) {
      const row = this.rows[ended];
      this.window.interrupt(row.status);
    }

    if (ended) {
      this.rows.splice(0, ended);
    }

    let allowedRows = Math.min(
      this.maxDisplayedRows ?? Number.POSITIVE_INFINITY,
      this.window.rows,
    );
    if (this.status) {
      // leave room for status ro
      --allowedRows;
    }

    let n = Math.min(this.rows.length, allowedRows);
    if (n < this.rows.length && this.overflowText) {
      // leave room for status text
      --n;
    }

    const rows = this.rows.slice(0, n).map((x) => x.status);

    if (this.overflowText) {
      const diff = this.rows.length - n;
      if (diff > 0) {
        const text = this.overflowText(diff + 1, this.rows.length);
        if (text) {
          rows[rows.length - 1] = text;
        }
      }
    }
    if (this.status) {
      rows.push(this.status);
    }

    this.window.render(rows);
  };
}
