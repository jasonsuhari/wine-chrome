import {getImageDetails} from './image';

const MARK = 'data-wine-image';
const MAX_PIXELS = 1024 * 1024;

export const DARK_IMAGE_STYLE = `img[${MARK}] { filter: invert(100%) hue-rotate(180deg) brightness(92%) !important; }`;

const verdicts = new Map<string, Promise<boolean>>();
let observer: MutationObserver | null = null;

function isDarkGlyph(src: string): Promise<boolean> {
    let verdict = verdicts.get(src);
    if (!verdict) {
        verdict = getImageDetails(src).then(
            ({isDark, isTransparent, width, height}) => isDark && isTransparent && width > 2 && width * height <= MAX_PIXELS,
            () => false,
        );
        verdicts.set(src, verdict);
    }
    return verdict;
}

function inspect(img: HTMLImageElement) {
    const src = img.currentSrc || img.src;
    if (!src) {
        return;
    }
    isDarkGlyph(src).then((dark) => img.toggleAttribute(MARK, dark));
}

function inspectWhenLoaded(img: HTMLImageElement) {
    if (img.complete) {
        inspect(img);
    } else {
        img.addEventListener('load', () => inspect(img), {once: true});
    }
}

export function watchDarkImages(): void {
    document.querySelectorAll('img').forEach(inspectWhenLoaded);
    observer = new MutationObserver((records) => {
        for (const record of records) {
            if (record.type === 'attributes') {
                inspectWhenLoaded(record.target as HTMLImageElement);
                continue;
            }
            record.addedNodes.forEach((node) => {
                if (node instanceof HTMLImageElement) {
                    inspectWhenLoaded(node);
                } else if (node instanceof Element) {
                    node.querySelectorAll('img').forEach(inspectWhenLoaded);
                }
            });
        }
    });
    observer.observe(document, {childList: true, subtree: true, attributes: true, attributeFilter: ['src', 'srcset']});
}

export function stopWatchingDarkImages(): void {
    observer?.disconnect();
    observer = null;
    document.querySelectorAll(`img[${MARK}]`).forEach((img) => img.removeAttribute(MARK));
}
