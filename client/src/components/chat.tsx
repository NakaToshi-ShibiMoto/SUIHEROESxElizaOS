import { useQuery } from "@tanstack/react-query"
import { Button } from "@/components/ui/button";
import {
  ChatBubble,
  ChatBubbleMessage,
  ChatBubbleTimestamp,
} from "@/components/ui/chat/chat-bubble";
import { ChatInput } from "@/components/ui/chat/chat-input";
import { ChatMessageList } from "@/components/ui/chat/chat-message-list";
import { useTransition, animated, type AnimatedProps } from "@react-spring/web";
import { Paperclip, Send, X } from "lucide-react";
import {
  useEffect,
  useRef,
  useState,
  useCallback,
  type FormEvent,
  type KeyboardEvent,
} from "react";
import type { Content, UUID } from "@elizaos/core";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "@/lib/api";
import { cn, moment } from "@/lib/utils";
import { Avatar, AvatarImage } from "@/components/ui/avatar";
import CopyButton from "@/components/copy-button";
import ChatTtsButton from "@/components/ui/chat/chat-tts-button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useToast } from "@/hooks/use-toast";
import AIWriter from "react-aiwriter";
import type { IAttachment } from "@/types";
import { AudioRecorder } from "@/components/audio-recorder";
import { Badge } from "@/components/ui/badge";

// 1) Map from agent *names* -> images
const agentImages: Record<string, string> = {
  MintMimic: "/images/mintmimic.webp",
  DeFiDriver: "/images/defidriver.webp",
  SuiShift: "/images/suishift.webp",
  MoveSensei: "/images/movesensei.webp",
  TxTrickster: "/images/txtrickster.webp",
  SuiSeer: "/images/suiseer.webp",
};

type ExtraContentFields = {
  user: string;
  createdAt: number;
  isLoading?: boolean;
};

type ContentWithUser = Content & ExtraContentFields;

type AnimatedDivProps = AnimatedProps<{
  style: React.CSSProperties;
}> & {
  children?: React.ReactNode;
};

export default function ChatPage({ agentId }: { agentId: UUID }) {
  const { toast } = useToast();
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [input, setInput] = useState("");
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const formRef = useRef<HTMLFormElement>(null);

  const queryClient = useQueryClient();

  // 2) Fetch all agents so we can find the agent name by UUID
  const agentsQuery = useQuery({
    queryKey: ["agents"],
    queryFn: () => apiClient.getAgents(),
  });

  // 3) Find the agent with a matching ID
  const foundAgent = agentsQuery.data?.agents.find(
    (a: { id: string; name: string }) => a.id === agentId
  );

  // 4) Derive the image URL from the agent's name
  const agentName = foundAgent?.name; // e.g. "DeFiDriver"
  // If no name is found, we’ll fall back to default
  const agentImageUrl = agentImages[agentName] || "/images/default-avatar.png";

  // Helper to figure out message bubble side
  const getMessageVariant = (role: string) =>
    role !== "user" ? "received" : "sent";

  // Auto-scroll to bottom
  const scrollToBottom = useCallback(() => {
    if (messagesContainerRef.current) {
      messagesContainerRef.current.scrollTop =
        messagesContainerRef.current.scrollHeight;
    }
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [scrollToBottom]);

  useEffect(() => {
    // re-scroll whenever messages update
    scrollToBottom();
  }, [queryClient.getQueryData(["messages", agentId]), scrollToBottom]);

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      if (e.nativeEvent.isComposing) return;
      handleSendMessage(e as unknown as FormEvent<HTMLFormElement>);
    }
  };

  const handleSendMessage = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!input.trim()) return;

    const attachments: IAttachment[] | undefined = selectedFile
      ? [
          {
            url: URL.createObjectURL(selectedFile),
            contentType: selectedFile.type,
            title: selectedFile.name,
          },
        ]
      : undefined;

    // Add placeholders: user message + loading message
    const newMessages = [
      {
        text: input,
        user: "user",
        createdAt: Date.now(),
        attachments,
      },
      {
        text: input,
        user: "system",
        isLoading: true,
        createdAt: Date.now(),
      },
    ];

    // Update local React Query cache
    queryClient.setQueryData(
      ["messages", agentId],
      (old: ContentWithUser[] = []) => [...old, ...newMessages]
    );

    sendMessageMutation.mutate({
      message: input,
      selectedFile: selectedFile || null,
    });

    setSelectedFile(null);
    setInput("");
    formRef.current?.reset();
  };

  // Focus the chat input on mount
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // The actual send to the server
  const sendMessageMutation = useMutation({
    mutationKey: ["send_message", agentId],
    mutationFn: ({
      message,
      selectedFile,
    }: {
      message: string;
      selectedFile?: File | null;
    }) => apiClient.sendMessage(agentId, message, selectedFile),
    onSuccess: (serverMessages: ContentWithUser[]) => {
      // Replace the loading placeholders with real messages
      queryClient.setQueryData(
        ["messages", agentId],
        (old: ContentWithUser[] = []) => [
          ...old.filter((msg) => !msg.isLoading),
          ...serverMessages.map((m) => ({
            ...m,
            createdAt: Date.now(),
          })),
        ]
      );
    },
    onError: (err) => {
      toast({
        variant: "destructive",
        title: "Unable to send message",
        description: String(err),
      });
    },
  });

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file?.type.startsWith("image/")) {
      setSelectedFile(file);
    }
  };

  // Get the messages from the cache
  const messages =
    queryClient.getQueryData<ContentWithUser[]>(["messages", agentId]) || [];

  // Animate the message list
  const transitions = useTransition(messages, {
    keys: (message) =>
      `${message.createdAt}-${message.user}-${message.text}`,
    from: { opacity: 0, transform: "translateY(50px)" },
    enter: { opacity: 1, transform: "translateY(0px)" },
    leave: { opacity: 0, transform: "translateY(10px)" },
  });

  const CustomAnimatedDiv = animated.div as React.FC<AnimatedDivProps>;

  return (
    <div className="flex flex-col w-full h-[calc(100dvh)] p-4">
      {/* Messages */}
      <div className="flex-1 overflow-y-auto">
        <ChatMessageList ref={messagesContainerRef}>
          {transitions((style, message: ContentWithUser) => {
            const variant = getMessageVariant(message.user);
            return (
              <CustomAnimatedDiv
                key={`${message.createdAt}-${message.user}-${message.text}`}
                style={{
                  ...style,
                  display: "flex",
                  flexDirection: "column",
                  gap: "0.5rem",
                  padding: "1rem",
                }}
              >
                <ChatBubble variant={variant}>
                  {/* Render the agent’s avatar if it's not the user's message */}
                  {message.user !== "user" && (
                    <Avatar className="mr-2">
                      <AvatarImage src={agentImageUrl} alt={agentId} />
                    </Avatar>
                  )}
                  <div className="flex flex-col">
                    <ChatBubbleMessage isLoading={message.isLoading}>
                      {message.user !== "user" ? (
                        // For system/assistant messages, show the AIWriter animation
                        <AIWriter>{message.text}</AIWriter>
                      ) : (
                        // For user messages, just show the text
                        message.text
                      )}

                      {/* Attachments (images) */}
                      {message.attachments?.map((attachment) => (
                        <div
                          key={`${attachment.url}-${attachment.title}`}
                          className="flex flex-col gap-1 mt-2"
                        >
                          <img
                            alt="attachment"
                            src={attachment.url}
                            width="100%"
                            height="100%"
                            className="w-64 rounded-md"
                          />
                        </div>
                      ))}
                    </ChatBubbleMessage>

                    {/* Footer with Copy, TTS, time, etc. */}
                    <div className="flex items-center justify-between w-full mt-1">
                      {/* Left side: copy & TTS if not loading */}
                      {message.text && !message.isLoading && (
                        <div className="flex items-center gap-1">
                          <CopyButton text={message.text} />
                          <ChatTtsButton
                            agentId={agentId}
                            text={message.text}
                          />
                        </div>
                      )}
                      {/* Right side: action, source, timestamp */}
                      <div
                        className={cn([
                          message.isLoading ? "mt-2" : "",
                          "flex items-center gap-4 select-none",
                        ])}
                      >
                        {message.source && (
                          <Badge variant="outline">{message.source}</Badge>
                        )}
                        {message.action && (
                          <Badge variant="outline">{message.action}</Badge>
                        )}
                        {message.createdAt && (
                          <ChatBubbleTimestamp
                            timestamp={moment(message.createdAt).format("LT")}
                          />
                        )}
                      </div>
                    </div>
                  </div>
                </ChatBubble>
              </CustomAnimatedDiv>
            );
          })}
        </ChatMessageList>
      </div>

      {/* Input / Form */}
      <div className="px-4 pb-4">
        <form
          ref={formRef}
          onSubmit={handleSendMessage}
          className="relative rounded-md border bg-card"
        >
          {/* Preview any selected image */}
          {selectedFile && (
            <div className="p-3 flex">
              <div className="relative rounded-md border p-2">
                <Button
                  onClick={() => setSelectedFile(null)}
                  className="absolute -right-2 -top-2 size-[22px] ring-2 ring-background"
                  variant="outline"
                  size="icon"
                >
                  <X />
                </Button>
                <img
                  alt="Selected file"
                  src={URL.createObjectURL(selectedFile)}
                  height="100%"
                  width="100%"
                  className="aspect-square object-contain w-16"
                />
              </div>
            </div>
          )}
          <ChatInput
            ref={inputRef}
            onKeyDown={handleKeyDown}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Type your message here..."
            className="min-h-12 resize-none rounded-md bg-card border-0 p-3 shadow-none focus-visible:ring-0"
          />
          <div className="flex items-center p-3 pt-0">
            <Tooltip>
              <TooltipTrigger asChild>
                <div>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => fileInputRef.current?.click()}
                  >
                    <Paperclip className="size-4" />
                    <span className="sr-only">Attach file</span>
                  </Button>
                  <input
                    type="file"
                    ref={fileInputRef}
                    onChange={handleFileChange}
                    accept="image/*"
                    className="hidden"
                  />
                </div>
              </TooltipTrigger>
              <TooltipContent side="left">
                <p>Attach file</p>
              </TooltipContent>
            </Tooltip>

            <AudioRecorder
              agentId={agentId}
              onChange={(newInput: string) => setInput(newInput)}
            />

            <Button
              disabled={!input.trim() || sendMessageMutation.isPending}
              type="submit"
              size="sm"
              className="ml-auto gap-1.5 h-[30px]"
            >
              {sendMessageMutation.isPending ? "..." : "Send Message"}
              <Send className="size-3.5" />
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
