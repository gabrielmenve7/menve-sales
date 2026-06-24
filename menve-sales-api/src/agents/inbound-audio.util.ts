const AUDIO_BODY = "[Áudio]";

export function isInboundAudioMessage(args: {
  body: string;
  mediaType?: string | null;
}): boolean {
  if (args.body === AUDIO_BODY) return true;
  const mt = args.mediaType?.split(";")[0]?.trim().toLowerCase() ?? "";
  return mt.startsWith("audio/");
}

export function llmContentFromInboundMessage(args: {
  body: string;
  audioTranscript?: string | null;
}): string {
  const transcript = args.audioTranscript?.trim();
  if (transcript) {
    return `[Áudio do lead]: ${transcript}`;
  }
  if (args.body === AUDIO_BODY) {
    return "[Áudio do lead] (transcrição ainda não disponível)";
  }
  return args.body;
}
