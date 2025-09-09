// frontend/src/utils/chartUtils.js

export const CHART_CONSTANTS = {
  GOLDEN_ANGLE: 137.5, // Used for hue rotation to get distinct colors
  BASE_SATURATION_MIN: 60,
  BASE_SATURATION_MAX: 85,
  BASE_LIGHTNESS_MIN: 55,
  BASE_LIGHTNESS_MAX: 75,
};

/**
 * Generates a distinct color using the golden angle for hue distribution.
 * @param {number} index - The index of the item.
 * @param {number} total - The total number of items for color generation.
 * @param {string} type - 'background' or 'border'.
 * @returns {string} HSLA or HSL color string.
 */
export const generateDistinctColor = (index, total, type = 'background') => {
  if (total <= 0) return type === 'background' ? 'rgba(200, 200, 200, 0.7)' : 'rgba(150, 150, 150, 1)';

  const hue = (index * CHART_CONSTANTS.GOLDEN_ANGLE + 120) % 360; // Adding an offset to avoid reds first

  let saturation, lightness;
  if (type === 'background') {
    saturation = CHART_CONSTANTS.BASE_SATURATION_MIN + (index * 6) % (CHART_CONSTANTS.BASE_SATURATION_MAX - CHART_CONSTANTS.BASE_SATURATION_MIN + 1);
    lightness = CHART_CONSTANTS.BASE_LIGHTNESS_MIN + (index * 5) % (CHART_CONSTANTS.BASE_LIGHTNESS_MAX - CHART_CONSTANTS.BASE_LIGHTNESS_MIN + 1);
    return `hsla(${hue.toFixed(0)}, ${saturation}%, ${lightness}%, 0.75)`;
  } else { // border
    saturation = (CHART_CONSTANTS.BASE_SATURATION_MIN + 10) + (index * 6) % (CHART_CONSTANTS.BASE_SATURATION_MAX - CHART_CONSTANTS.BASE_SATURATION_MIN - 5); // slightly more saturated
    lightness = (CHART_CONSTANTS.BASE_LIGHTNESS_MIN - 10) + (index * 5) % (CHART_CONSTANTS.BASE_LIGHTNESS_MAX - CHART_CONSTANTS.BASE_LIGHTNESS_MIN - 15); // slightly darker
    return `hsl(${hue.toFixed(0)}, ${Math.min(100, saturation)}%, ${Math.max(0, lightness)}%)`;
  }
};


/**
 * Generates an array of distinct colors.
 * @param {number} count - The number of colors to generate.
 * @param {string} type - 'background' or 'border'.
 * @returns {string[]} Array of HSLA or HSL color strings.
 */
export const generateColorPalette = (count, type = 'background') => {
  const colors = [];
  for (let i = 0; i < count; i++) {
    colors.push(generateDistinctColor(i, count, type));
  }
  return colors;
};

/**
 * Generates a palette of distinct red tones.
 * @param {number} count - The number of colors to generate.
 * @param {string} type - 'background' or 'border'.
 * @returns {string[]} An array of HSLA or HSL color strings.
 */
export const generateRedTonePalette = (count, type = 'background') => {
  if (count <= 0) return [];

  const palette = [];
  const baseHue = 0; // Red
  const saturation = 75; // A strong but not overly neon saturation
  const startLightness = 40; // Start with a darker red
  const endLightness = 70;   // Go up to a lighter, softer red
  
  // Create a step to evenly distribute lightness across the number of colors needed
  const lightnessStep = (count > 1) ? (endLightness - startLightness) / (count - 1) : 0;

  for (let i = 0; i < count; i++) {
    const lightness = startLightness + (i * lightnessStep);
    if (type === 'background') {
      // Background colors with some transparency
      palette.push(`hsla(${baseHue}, ${saturation}%, ${lightness}%, 0.8)`);
    } else { // 'border'
      // Border colors are fully opaque and slightly darker
      palette.push(`hsl(${baseHue}, ${saturation}%, ${lightness - 10}%)`);
    }
  }

  return palette;
};


/**
 * Extracts a base name from a product string, typically the first word (e.g., stock ticker).
 * @param {string} productName - The full product name.
 * @returns {string} The extracted base name or 'Unknown'.
 */
export const getBaseProductName = (productName) => {
  if (!productName || typeof productName !== 'string') return 'Unknown';
  const parts = productName.split(' ');
  return parts[0] || 'Unknown';
};