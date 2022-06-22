export interface IPriceProvider {
    init(): void;
    getPair(): string;
    getPrice(): Promise<number>;
    setLogger(logger:any): void;
    setUsdtUsdProvider(provider:IPriceProvider): void;
}