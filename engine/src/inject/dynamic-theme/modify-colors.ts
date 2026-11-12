import {extendThemeCacheKeys, getBackgroundPoles, getTextPoles, modifyBgColorExtended, modifyFgColorExtended, modifyLightSchemeColorExtended} from '@plus/utils/theme';
import type {Theme} from '../../definitions';
import {applyColorMatrix, createFilterMatrix} from '../../generators/utils/matrix';
import {getRegisteredColor, registerColor} from '../../inject/dynamic-theme/palette';
import type {RGBA, HSLA} from '../../utils/color';
import {parseToHSLWithCache, rgbToHSL, hslToRGB, rgbToString, rgbToHexString} from '../../utils/color';
import {scale} from '../../utils/math';

import {WINE_ENGINE} from './wine-engine';


type HSLModifyFunction = ((hsl: HSLA) => HSLA) | ((hsl: HSLA, pole: HSLA) => HSLA) | ((hsl: HSLA, pole: HSLA, anotherPole: HSLA) => HSLA);

declare const __PLUS__: boolean;

function getBgPole(theme: Theme) {
    const isDarkScheme = theme.mode === 1;
    const prop: keyof Theme = isDarkScheme ? 'darkSchemeBackgroundColor' : 'lightSchemeBackgroundColor';
    return theme[prop];
}

function getFgPole(theme: Theme) {
    const isDarkScheme = theme.mode === 1;
    const prop: keyof Theme = isDarkScheme ? 'darkSchemeTextColor' : 'lightSchemeTextColor';
    return theme[prop];
}

const colorModificationCache = new Map<HSLModifyFunction, Map<string, string>>();

export function clearColorModificationCache(): void {
    colorModificationCache.clear();
}

const rgbCacheKeys: Array<keyof RGBA> = ['r', 'g', 'b', 'a'];

export const themeCacheKeys: Array<keyof Theme> = [
    'mode',
    'brightness',
    'contrast',
    'grayscale',
    'sepia',
    'darkSchemeBackgroundColor',
    'darkSchemeTextColor',
    'lightSchemeBackgroundColor',
    'lightSchemeTextColor',
];
extendThemeCacheKeys(themeCacheKeys);

function getCacheId(rgb: RGBA, theme: Theme, poleA?: string, poleB?: string): string {
    let resultId = '';
    rgbCacheKeys.forEach((key) => {
        resultId += `${rgb[key]};`;
    });
    themeCacheKeys.forEach((key) => {
        resultId += `${theme[key]};`;
    });
    resultId += `${poleA};${poleB}`;
    return resultId;
}

function modifyColorWithCache(rgb: RGBA, theme: Theme, modifyHSL: HSLModifyFunction, poleColor?: string, anotherPoleColor?: string): string {
    let fnCache: Map<string, string>;
    if (colorModificationCache.has(modifyHSL)) {
        fnCache = colorModificationCache.get(modifyHSL)!;
    } else {
        fnCache = new Map();
        colorModificationCache.set(modifyHSL, fnCache);
    }
    const id = getCacheId(rgb, theme, poleColor, anotherPoleColor);
    if (fnCache.has(id)) {
        return fnCache.get(id)!;
    }

    const hsl = rgbToHSL(rgb);
    const pole = poleColor == null ? null : parseToHSLWithCache(poleColor);
    const anotherPole = anotherPoleColor == null ? null : parseToHSLWithCache(anotherPoleColor);
    const modified = modifyHSL(hsl, pole!, anotherPole!);
    const {r, g, b, a} = hslToRGB(modified);
    const matrix = createFilterMatrix({...theme, mode: 0});
    const [rf, gf, bf] = applyColorMatrix([r, g, b], matrix);

    const color = (a === 1 ?
        rgbToHexString({r: rf, g: gf, b: bf}) :
        rgbToString({r: rf, g: gf, b: bf, a}));

    fnCache.set(id, color);
    return color;
}

function noopHSL(hsl: HSLA): HSLA {
    return hsl;
}

export function modifyColor(rgb: RGBA, theme: Theme): string {
    return modifyColorWithCache(rgb, theme, noopHSL);
}

function modifyAndRegisterColor(
    type: 'background' | 'text' | 'border',
    rgb: RGBA,
    theme: Theme,
    modifier: (rgb: RGBA, theme: Theme) => string,
) {
    const registered = getRegisteredColor(type, rgb);
    if (registered) {
        return registered;
    }
    const value = modifier(rgb, theme);
    return registerColor(type, rgb, value);
}

function modifyLightSchemeColor(rgb: RGBA, theme: Theme): string {
    const poleBg = getBgPole(theme);
    const poleFg = getFgPole(theme);
    return modifyColorWithCache(rgb, theme, modifyLightModeHSL, poleFg, poleBg);
}

function modifyLightModeHSL({h, s, l, a}: HSLA, poleFg: HSLA, poleBg: HSLA): HSLA {
    const isDark = l < 0.5;
    let isNeutral: boolean;
    if (isDark) {
        isNeutral = l < 0.2 || s < 0.12;
    } else {
        const isBlue = h > 200 && h < 280;
        isNeutral = s < 0.24 || (l > 0.8 && isBlue);
    }

    let hx = h;
    let sx = s;
    if (isNeutral) {
        if (isDark) {
            hx = poleFg.h;
            sx = poleFg.s;
        } else {
            hx = poleBg.h;
            sx = poleBg.s;
        }
    }

    const lx = scale(l, 0, 1, poleFg.l, poleBg.l);

    return {h: hx, s: sx, l: lx, a};
}

const MAX_BG_LIGHTNESS = 0.4;

function isAccentBlue(h: number, s: number): boolean {
    return s >= 0.12 && h >= 185 && h <= 265;
}

function toWineHue(h: number, s: number): number {
    return isAccentBlue(h, s) ? WINE_ENGINE.accentHue + (h - 225) * 0.15 : h;
}

function isRedFamily(h: number): boolean {
    return h >= 320 || h <= 20;
}

function surfaceLightness(l: number, pole: HSLA): number {
    const panelTop = pole.l + WINE_ENGINE.raisedStep * 0.6;
    const panelBottom = pole.l + WINE_ENGINE.raisedStep * 1.1;
    if (l >= 0.985) {
        return pole.l;
    }
    if (l >= 0.93) {
        return scale(l, 0.93, 0.985, panelBottom, panelTop);
    }
    return scale(l, 0.5, 0.93, MAX_BG_LIGHTNESS, panelBottom);
}

const DARK_PAGE_LIGHTNESS = 0.14;

function darkSurfaceLightness(l: number, pole: HSLA): number {
    if (l <= DARK_PAGE_LIGHTNESS) {
        return scale(l, 0, DARK_PAGE_LIGHTNESS, pole.l * 0.55, pole.l);
    }
    return scale(l, DARK_PAGE_LIGHTNESS, 0.5, pole.l + WINE_ENGINE.raisedStep * 0.6, MAX_BG_LIGHTNESS);
}

function wineSurface(l: number, pole: HSLA, a: HSLA['a']): HSLA {
    const s = Math.max(0.12, WINE_ENGINE.surfaceSaturation - Math.max(0, l - 0.15) * 1.2);
    return {h: pole.h, s, l, a};
}

function modifyBgHSL({h, s, l, a}: HSLA, pole: HSLA): HSLA {
    const isDark = l < 0.5;
    const isBlue = h > 200 && h < 280;
    const isNeutral = s < 0.12 || (l > 0.8 && isBlue) || (l < 0.25 && s < 0.35);
    if (isDark) {
        const lx = darkSurfaceLightness(l, pole);
        if (isNeutral) {
            return wineSurface(lx, pole, a);
        }
        return {h: toWineHue(h, s), s, l: lx, a};
    }

    let lx = surfaceLightness(l, pole);

    if (isNeutral) {
        return wineSurface(lx, pole, a);
    }

    let hx = toWineHue(h, s);
    const isYellow = hx > 60 && hx < 180;
    if (isYellow) {
        const isCloserToGreen = hx > 120;
        if (isCloserToGreen) {
            hx = scale(hx, 120, 180, 135, 180);
        } else {
            hx = scale(hx, 60, 120, 60, 105);
        }
    }

    if (hx > 40 && hx < 80) {
        lx *= 0.75;
    }

    return {h: hx, s, l: lx, a};
}

function _modifyBackgroundColor(rgb: RGBA, theme: Theme) {
    if (theme.mode === 0) {
        if (__PLUS__) {
            const poles = getBackgroundPoles(theme);
            return modifyColorWithCache(rgb, theme, modifyLightSchemeColorExtended, poles[0], poles[1]);
        }
        return modifyLightSchemeColor(rgb, theme);
    }
    if (__PLUS__) {
        const poles = getBackgroundPoles(theme);
        return modifyColorWithCache(rgb, theme, modifyBgColorExtended, poles[0], poles[1]);
    }
    const pole = getBgPole(theme);
    return modifyColorWithCache(rgb, theme, modifyBgHSL, pole);
}

export function modifyBackgroundColor(rgb: RGBA, theme: Theme, shouldRegisterColorVariable = true): string {
    if (!shouldRegisterColorVariable) {
        return _modifyBackgroundColor(rgb, theme);
    }
    return modifyAndRegisterColor('background', rgb, theme, _modifyBackgroundColor);
}

const MIN_FG_LIGHTNESS = 0.55;

function clampAccentText(hsl: HSLA): HSLA {
    if (hsl.s < 0.24 || !isRedFamily(hsl.h)) {
        return hsl;
    }
    return {...hsl, s: Math.max(hsl.s, 0.7), l: Math.min(hsl.l, WINE_ENGINE.maxAccentTextLightness)};
}

function isLinkText(h: number, s: number): boolean {
    return s >= 0.12 && h >= 185 && h <= 290;
}

function modifyFgHSL({h, s, l, a}: HSLA, pole: HSLA): HSLA {
    if (isLinkText(h, s)) {
        return {h: pole.h, s: pole.s, l: pole.l, a};
    }
    const isLight = l > 0.5;
    const isNeutral = l < 0.2 || s < 0.24;
    if (isLight) {
        const lx = scale(l, 0.5, 1, MIN_FG_LIGHTNESS, pole.l);
        if (isNeutral) {
            return {h: pole.h, s: pole.s, l: lx, a};
        }
        return clampAccentText({h: toWineHue(h, s), s, l: lx, a});
    }

    if (isNeutral) {
        const lx = scale(l, 0, 0.5, pole.l, MIN_FG_LIGHTNESS);
        return {h: pole.h, s: pole.s, l: lx, a};
    }

    const lx = scale(l, 0, 0.5, pole.l, MIN_FG_LIGHTNESS);
    return clampAccentText({h: toWineHue(h, s), s, l: lx, a});
}

function _modifyForegroundColor(rgb: RGBA, theme: Theme) {
    if (theme.mode === 0) {
        if (__PLUS__) {
            const poles = getTextPoles(theme);
            return modifyColorWithCache(rgb, theme, modifyLightSchemeColorExtended, poles[0], poles[1]);
        }
        return modifyLightSchemeColor(rgb, theme);
    }
    if (__PLUS__) {
        const poles = getTextPoles(theme);
        return modifyColorWithCache(rgb, theme, modifyFgColorExtended, poles[0], poles[1]);
    }
    const pole = getFgPole(theme);
    return modifyColorWithCache(rgb, theme, modifyFgHSL, pole);
}

export function modifyForegroundColor(rgb: RGBA, theme: Theme, shouldRegisterColorVariable = true): string {
    if (!shouldRegisterColorVariable) {
        return _modifyForegroundColor(rgb, theme);
    }
    return modifyAndRegisterColor('text', rgb, theme, _modifyForegroundColor);
}

function modifyBorderHSL({h, s, l, a}: HSLA, _poleFg: HSLA, poleBg: HSLA): HSLA {
    const isNeutral = l < 0.2 || s < 0.24;
    if (isNeutral) {
        return {h: poleBg.h, s: WINE_ENGINE.borderSaturation, l: scale(l, 0, 1, 0.32, 0.14), a};
    }
    return {h: toWineHue(h, s), s, l: scale(l, 0, 1, 0.5, 0.2), a};
}

function _modifyBorderColor(rgb: RGBA, theme: Theme) {
    if (theme.mode === 0) {
        return modifyLightSchemeColor(rgb, theme);
    }
    const poleFg = getFgPole(theme);
    const poleBg = getBgPole(theme);
    return modifyColorWithCache(rgb, theme, modifyBorderHSL, poleFg, poleBg);
}

export function modifyBorderColor(rgb: RGBA, theme: Theme, shouldRegisterColorVariable = true): string {
    if (!shouldRegisterColorVariable) {
        return _modifyBorderColor(rgb, theme);
    }
    return modifyAndRegisterColor('border', rgb, theme, _modifyBorderColor);
}

export function modifyShadowColor(rgb: RGBA, theme: Theme): string {
    return modifyBackgroundColor(rgb, theme);
}

export function modifyGradientColor(rgb: RGBA, theme: Theme): string {
    return modifyBackgroundColor(rgb, theme);
}
