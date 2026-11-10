import { Component, type ReactNode } from "react";

export class RenderBoundary extends Component<
  {
    children: ReactNode;
    onDownload: () => void;
    onReload: () => Promise<void>;
  },
  { error?: string; retrying: boolean }
> {
  state: { error?: string; retrying: boolean } = { retrying: false };

  static getDerivedStateFromError(error: unknown) {
    return {
      error:
        error instanceof Error
          ? error.message
          : "Не удалось показать композицию.",
    };
  }
  private retry = async () => {
    if (this.state.retrying) return;
    this.setState({ retrying: true });
    try {
      await this.props.onReload();
      this.setState({ error: undefined, retrying: false });
    } catch (error) {
      this.setState({
        error:
          error instanceof Error
            ? error.message
            : "Библиотека пока недоступна.",
        retrying: false,
      });
    }
  };
  render() {
    if (!this.state.error) return this.props.children;
    return (
      <section className="render-error" role="alert">
        <h2>Не удалось показать композицию</h2>
        <p>
          Проект остаётся в памяти. Его можно скачать и повторить загрузку
          библиотеки.
        </p>
        <p className="fine-print">{this.state.error}</p>
        <button
          className="primary"
          disabled={this.state.retrying}
          onClick={() => void this.retry()}
        >
          {this.state.retrying ? "Загружаем…" : "Повторить загрузку библиотеки"}
        </button>
        <button className="secondary" onClick={this.props.onDownload}>
          Скачать проект JSON
        </button>
      </section>
    );
  }
}
