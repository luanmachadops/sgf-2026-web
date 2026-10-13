// Ícones vetoriais das etiquetas QR, usados na prévia (SVG na tela) e no PDF
// (pdf-lib, drawSvgPath). Sem dependência de navegador: os testes importam no Node.

export interface LabelIconPath {
    d: string;
    fill: string;
}

export interface LabelIcon {
    /** Caixa de desenho (viewBox quadrado, origem 0,0). */
    box: number;
    /** Fundo com cantos arredondados (opcional). */
    background?: { fill: string; radius: number };
    /** Transformação aplicada aos caminhos: translate + escala uniforme. */
    offset?: { x: number; y: number; scale: number };
    paths: LabelIconPath[];
}

/** Logo do app Exattus Rotta (mesmo desenho de public/exattus-rotta.svg). */
export const APP_LOGO_ICON: LabelIcon = {
    box: 512,
    background: { fill: '#0F2B2F', radius: 115.2 },
    offset: { x: 97.28, y: 100.86, scale: 1.12892 },
    paths: [
        { d: "M38.75,46.91l64.87-.08c5.58-12.34,12.34-22.57,22-32.33l-119.58-.03.04,115.08c9.77-10.49,20.1-17.5,32.51-22.18l.15-60.46Z", fill: "#fff" },
        { d: "M177.51,235.64l-55.67-38.31,1.49,22.46-55.71-.1c-18.92-.03-33.5-15.04-34.68-33.2-1.13-17.4,11.78-36.4,30.76-36.48l78.63-.35c27.96-.12,52.98-14.77,64.56-40.48,3.63-8.07,5.53-17.13,5.1-26.1-.44-9.04-7.73-15.49-16.19-15.48-7.32,0-15.79,5.82-16.02,14.64-.48,18.45-13.8,34.48-33.31,34.56l-80.8.34c-19.89.08-37.85,9.31-50.48,24.7C-1.19,161.76-4.77,189.39,6.64,213.5c9.93,20.98,31.85,38.12,57.03,38.22l59.9.23-1.76,22.9,55.69-39.21Z", fill: "#fff" },
        { d: "M195.68,180.54c13.47-17.88,25.75-35.55,38-54.26,5.05-7.71,9.04-15.57,12.1-24.23,10.15-28.72-7.99-60.79-37.02-67.9-17.48-4.28-33.67.08-46.54,10.69-16.94,13.97-23.54,35.8-16.6,57.3l-33.35.16C101.47,48.95,142.26.02,195.87,0s94.54,49.05,83.52,102.46c-2.65,12.85-8.09,24.54-14.91,35.91-8.76,14.61-17.82,28.08-27.85,41.92l-40.78,56.27-52.39-72.34c12.59-.19,24.12-2.02,34.83-7.39l17.39,23.7Z", fill: "#f26a1f" },
    ],
};

/** Google Play: triângulo de "play" nas quatro cores da loja. */
export const GOOGLE_PLAY_ICON: LabelIcon = {
    box: 24,
    paths: [
        { d: 'M3 1.5L13.2 12L3 22.5C2.6 22.3 2.4 21.9 2.4 21.4V2.6C2.4 2.1 2.6 1.7 3 1.5Z', fill: '#2196F3' },
        { d: 'M3 1.5C3.3 1.3 3.8 1.3 4.2 1.5L16.4 8.6L13.2 12Z', fill: '#00C853' },
        { d: 'M3 22.5L13.2 12L16.4 15.4L4.2 22.5C3.8 22.7 3.3 22.7 3 22.5Z', fill: '#F44336' },
        { d: 'M16.4 8.6L20.6 11C21.4 11.5 21.4 12.5 20.6 13L16.4 15.4L13.2 12Z', fill: '#FFC107' },
    ],
};

/** Apple: maçã com a mordida e a folha. */
export const APPLE_ICON: LabelIcon = {
    box: 24,
    paths: [
        {
            d: 'M12 7.4C10.6 6.6 9.4 6.4 8.3 6.6C5.6 7.1 3.9 9.6 4 12.9C4.1 16.8 6.7 21.5 9.1 21.5C10.3 21.5 10.8 20.8 12 20.8C13.2 20.8 13.6 21.5 14.9 21.5C16.6 21.5 18.4 19 19.6 16.4C17.8 15.6 16.6 13.9 16.6 11.9C16.6 10.2 17.5 8.7 18.8 7.9C17.9 6.9 16.6 6.5 15.4 6.5C14.2 6.5 13.2 7 12 7.4Z',
            fill: '#111827',
        },
        { d: 'M12.1 5.9C12 3.9 13.5 2.2 15.6 2C15.8 4.1 14.2 5.8 12.1 5.9Z', fill: '#111827' },
    ],
};
