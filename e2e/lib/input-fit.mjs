/** Compare rendered input text with its content box, including any unit padding. */
export const inputFit = async (locator, extraText = null) =>
  locator.evaluate((input, extra) => {
    const style = getComputedStyle(input);
    const canvas = document.createElement("canvas");
    const context = canvas.getContext("2d");
    // The font shorthand can be empty when individual variable-font properties
    // cannot be serialized together. Leaving canvas at its 10px default hides
    // clipping, so reconstruct its font from the computed longhand properties.
    context.font =
      style.font ||
      `${style.fontStyle} ${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
    const text = [
      input.value || input.placeholder,
      ...(extra === null ? [] : [extra]),
    ];
    return {
      available:
        input.clientWidth -
        parseFloat(style.paddingLeft) -
        parseFloat(style.paddingRight),
      widths: text.map((value) => context.measureText(value).width),
    };
  }, extraText);
