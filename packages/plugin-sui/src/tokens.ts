

export interface TokenMetadata {
    symbol: string;
    decimals: number;
    tokenAddress: string;
}

export const tokens: Map<string, TokenMetadata> = new Map([
    [
        "SUI",
        {
            symbol: "SUI",
            decimals: 9,
            tokenAddress: "0x2::sui::SUI",
        },
    ],
    [
        "USDC",
        {
            symbol: "USDC",
            decimals: 6,
            tokenAddress:
                "0xdba34672e30cb065b1f93e3ab55318768fd6fef66c15942c9f7cb846e2f900e7::usdc::USDC",
        },
    ],

    [
        "TARDI",
        {
            symbol: "TARDI",
            decimals: 9,
            tokenAddress: "0x4cf08813756dfa7519cb480a1a1a3472b5b4ec067592a8bee0f826808d218158::tardi::TARDI",
        },
    ],
    [
        "SUIAI",
        {
            symbol: "SUAI",
            decimals: 6,
            tokenAddress: "0xbc732bc5f1e9a9f4bdf4c0672ee538dbf56c161afe04ff1de2176efabdf41f92::suai::SUAI",
        },
    ],
]);

export const getTokenMetadata = (symbol: string) => {
    return tokens.get(symbol.toUpperCase());
};

export const getAmount = (amount: string | number, meta: TokenMetadata) => {
    const v = parseFloat(amount.toString());
    if (isNaN(v) || v <= 0) {
        throw new Error(`Invalid amount: ${amount} for token ${meta.symbol}`);
    }
    return BigInt(Math.floor(v * 10 ** meta.decimals)); // Convert to raw blockchain units
};
