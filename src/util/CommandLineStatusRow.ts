import { StringOrRenderFunction } from './TtyRenderWindow';

export interface CommandLineStatusRow {
  close(): void;
  end(text?: StringOrRenderFunction): void;
  interrupt(text: StringOrRenderFunction): void;
  render(): void;
  status: StringOrRenderFunction;
}
