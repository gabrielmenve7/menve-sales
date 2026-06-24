import { Injectable, Logger } from "@nestjs/common";
import { isInboundAudioMessage } from "./inbound-audio.util";

type AudioBytes = {
  bytes: Buffer;
  mimeType: string;
  fileName: string;
};

@Injectable()
export class AudioTranscriptionService {
  private readonly log = new Logger(AudioTranscriptionService.name);

  async transcribeMessage(args: {
    mediaUrl: string;
    mediaType?: string | null;
  }): Promise<string | null> {
    const apiKey = process.env.OPENAI_API_KEY?.trim();
    if (!apiKey) {
      this.log.warn("OPENAI_API_KEY ausente — transcrição de áudio ignorada");
      return null;
    }

    try {
      const audio = await this.loadAudioBytes(args.mediaUrl, args.mediaType);
      const form = new FormData();
      form.append(
        "file",
        new Blob([new Uint8Array(audio.bytes)], { type: audio.mimeType }),
        audio.fileName,
      );
      form.append("model", process.env.LARISSA_WHISPER_MODEL?.trim() || "whisper-1");
      form.append("language", "pt");

      const res = await fetch("https://api.openai.com/v1/audio/transcriptions", {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}` },
        body: form,
      });
      if (!res.ok) {
        const t = await res.text().catch(() => "");
        this.log.warn(`Whisper HTTP ${res.status}: ${t.slice(0, 200)}`);
        return null;
      }
      const json = (await res.json()) as { text?: string };
      const text = json.text?.trim();
      return text || null;
    } catch (e) {
      this.log.warn(
        `transcribe failed: ${e instanceof Error ? e.message : String(e)}`,
      );
      return null;
    }
  }

  needsTranscription(msg: {
    body: string;
    mediaType?: string | null;
    audioTranscript?: string | null;
    mediaUrl?: string | null;
  }): boolean {
    if (msg.audioTranscript?.trim()) return false;
    if (!msg.mediaUrl?.trim()) return false;
    return isInboundAudioMessage(msg);
  }

  private async loadAudioBytes(
    mediaUrl: string,
    mediaType?: string | null,
  ): Promise<AudioBytes> {
    const trimmed = mediaUrl.trim();
    if (trimmed.startsWith("data:")) {
      const m = /^data:([^;]+);base64,(.+)$/i.exec(trimmed.replace(/\s/g, ""));
      if (!m) throw new Error("data URL de áudio inválido");
      const mimeType = m[1].split(";")[0].trim() || mediaType || "audio/mpeg";
      return {
        bytes: Buffer.from(m[2], "base64"),
        mimeType,
        fileName: this.fileNameForMime(mimeType),
      };
    }

    const res = await fetch(trimmed);
    if (!res.ok) {
      throw new Error(`download áudio HTTP ${res.status}`);
    }
    const mimeType =
      res.headers.get("content-type")?.split(";")[0]?.trim() ||
      mediaType?.split(";")[0]?.trim() ||
      "audio/mpeg";
    const bytes = Buffer.from(await res.arrayBuffer());
    return {
      bytes,
      mimeType,
      fileName: this.fileNameForMime(mimeType),
    };
  }

  private fileNameForMime(mimeType: string): string {
    const m = mimeType.toLowerCase();
    if (m.includes("ogg")) return "audio.ogg";
    if (m.includes("webm")) return "audio.webm";
    if (m.includes("wav")) return "audio.wav";
    if (m.includes("m4a") || m.includes("mp4")) return "audio.m4a";
    return "audio.mp3";
  }
}
