export interface IPriceProvider {
    getPair(): string;
    getPrice(): Promise<number>;
}