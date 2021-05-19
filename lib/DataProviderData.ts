import { IPriceProvider } from "./IPriceProvider";

export class DataProviderData {
    public index!: number;
    public symbol!: string;
    public decimals!: number;
    public priceProvider!: IPriceProvider;
    public label!: string;
}