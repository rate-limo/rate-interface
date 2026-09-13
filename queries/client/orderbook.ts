import Decimal from "decimal.js";
export function getDefaultScale(price: number, scales: string[]) {
    const priceD = new Decimal(price);
    // divide price by 1000, then find the scale that is the closest to the price
    const priceD1000 = priceD.div(1000);
    // scales are array like ["0.0001", "0.001", "0.01", "0.1", "1", "10", "100"]
    // find the scale that is the closest to the price
    const defaultScale = scales.find(scale => priceD1000.lt(scale));
    // if no scale is found, return the first scale
    if (!defaultScale) {
        return scales[0];
    }
    return defaultScale;
}