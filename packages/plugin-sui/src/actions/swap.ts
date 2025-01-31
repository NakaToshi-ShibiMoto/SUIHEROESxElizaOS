import {
    ActionExample,
    Content,
    HandlerCallback,
    IAgentRuntime,
    Memory,
    ModelClass,
    ServiceType,
    State,
    composeContext,
    elizaLogger,
    generateObject,
    type Action,
} from "@elizaos/core";
import { SuiService } from "../services/sui";
import { z } from "zod";
import { tokens } from "../tokens";
import { getAmount } from "../tokens";  // Ensure the path is correct

export interface SwapPayload extends Content {
    from_token: string;
    destination_token: string;
    amount: string | number;
}

function isSwapContent(content: Content): content is SwapPayload {
    console.log("Content for transfer", content);
    return (
        typeof content.from_token === "string" &&
        typeof content.destination_token === "string" &&
        (typeof content.amount === "string" || typeof content.amount === "number")
    );
}

const swapTemplate = `Respond with a JSON markdown block containing only the extracted values. Use null for any values that cannot be determined.

Example response:
\`\`\`json
{
    "from_token": "sui",
    "destination_token": "usdc",
    "amount": "1"
}
\`\`\`

{{recentMessages}}

Given the recent messages, extract the following information about the requested token swap:
- Source Token you want to swap from
- Destination token you want to swap to
- Source Token Amount to swap

Respond with a JSON markdown block containing only the extracted values.`;

export default {
    name: "SWAP_TOKEN",
    similes: ["SWAP_TOKENS", "SWAP_SUI"],
    validate: async (runtime: IAgentRuntime, message: Memory) => {
        console.log("Validating sui transfer from user:", message.userId);
        return true;
    },
    description: "Swap from any token in the agent's wallet to another token",
    handler: async (
        runtime: IAgentRuntime,
        message: Memory,
        state: State,
        _options: { [key: string]: unknown },
        callback?: HandlerCallback
    ): Promise<boolean> => {
        elizaLogger.log("Starting SWAP_TOKEN handler...");

        const service = runtime.getService<SuiService>(ServiceType.TRANSCRIPTION);

        if (!state) {
            // Initialize or update state
            state = (await runtime.composeState(message)) as State;
        } else {
            state = await runtime.updateRecentMessageState(state);
        }

        // Define the schema for the expected output
        const swapSchema = z.object({
            from_token: z.string(),
            destination_token: z.string(),
            amount: z.union([z.string(), z.number()]),
        });

        // Compose transfer context
        const swapContext = composeContext({
            state,
            template: swapTemplate,
        });

        // Generate transfer content with the schema
        const content = await generateObject({
            runtime,
            context: swapContext,
            schema: swapSchema,
            modelClass: ModelClass.SMALL,
        });

        console.log("Generated content:", content);
        const swapContent = content.object as SwapPayload;
        elizaLogger.info("Swap content:", swapContent);

        if (service.getNetwork() === "mainnet") {
            // Validate transfer content
            if (!isSwapContent(swapContent)) {
                console.error("Invalid content for SWAP_TOKEN action.");
                if (callback) {
                    callback({
                        text: "Unable to process swap request. Invalid content provided.",
                        content: { error: "Invalid transfer content" },
                    });
                }
                return false;
            }

            // Validate and retrieve token metadata
            const destinationToken = await service.getTokenMetadata(swapContent.destination_token);
            const fromToken = await service.getTokenMetadata(swapContent.from_token);

            if (!destinationToken || !fromToken) {
                callback?.({
                    text: `Error: Invalid tokens selected for swap. Ensure both ${swapContent.from_token} and ${swapContent.destination_token} are supported.`,
                    content: { error: "Invalid token selection" },
                });
                return false;
            }

            // Ensure both tokens are supported in the system
            if (!tokens.has(fromToken.symbol) || !tokens.has(destinationToken.symbol)) {
                callback?.({
                    text: `Error: One or both of the tokens (${swapContent.from_token} → ${swapContent.destination_token}) are not supported.`,
                    content: { error: "Unsupported token pair" },
                });
                return false;
            }

            // Convert amount to a valid BigInt for SUI transaction
            const swapAmountFixed = getAmount(Number(swapContent.amount), fromToken);
            elizaLogger.info("Swap amount:", swapAmountFixed);

            console.log(`Swapping ${swapContent.amount} ${fromToken.symbol} → ${destinationToken.symbol} (Raw: ${swapAmountFixed})`);


            // Execute the swap transaction
            const result = await service.swapToken(
                fromToken.symbol,
                swapAmountFixed.toString(), // Ensure valid BigInt string
                0,
                destinationToken.symbol
            );

            if (result.success) {
                const humanReadableAmount = Number(swapContent.amount);

callback?.({
    text: `Successfully swapped ${humanReadableAmount} ${fromToken.symbol} for ${destinationToken.symbol}, Transaction: ${service.getTransactionLink(result.tx)}`,
    content: swapContent,
});
            } else {
                callback?.({
                    text: `Swap failed for ${fromToken.symbol} → ${destinationToken.symbol}. Try again later.`,
                    content: { error: "Swap execution failed" },
                });
            }
        } else {
            callback?.({
                text: "Sorry, I can only swap on the mainnet. Parsed parameters: " + JSON.stringify(swapContent, null, 2),
                content: { error: "Unsupported network" },
            });
            return false;
        }

        return true;
    },

    examples: [
        [
            {
                user: "{{user1}}",
                content: {
                    text: "Swap 1 SUI to USDC",
                },
            },
            {
                user: "{{user2}}",
                content: {
                    text: "I'll help you swap 1 SUI to USDC now...",
                    action: "SWAP_TOKEN",
                },
            },
            {
                user: "{{user2}}",
                content: {
                    text: "Successfully swapped 1 SUI to USDC, Transaction: 0x39a8c432d9bdad993a33cc1faf2e9b58fb7dd940c0425f1d6db3997e4b4b05c0",
                },
            },
        ],
        [
            {
                user: "{{user1}}",
                content: {
                    text: "Swap 1 USDC to SUI",
                },
            },
            {
                user: "{{user2}}",
                content: {
                    text: "I'll help you swap 1 USDC to SUI now...",
                    action: "SWAP_TOKEN",
                },
            },
            {
                user: "{{user2}}",
                content: {
                    text: "Successfully swapped 1 USDC to SUI, Transaction: 0x39a8c432d9bdad993a33cc1faf2e9b58fb7dd940c0425f1d6db3997e4b4b05c0",
                },
            },
        ],
    ] as ActionExample[][],
} as Action;
