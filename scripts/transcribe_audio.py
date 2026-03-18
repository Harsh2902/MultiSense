import argparse
import json
import os
import sys
import tempfile

from faster_whisper import WhisperModel
from huggingface_hub import snapshot_download


MODEL_REPOS = {
    "tiny": "Systran/faster-whisper-tiny",
    "base": "Systran/faster-whisper-base",
    "small": "Systran/faster-whisper-small",
    "medium": "Systran/faster-whisper-medium",
    "large-v2": "Systran/faster-whisper-large-v2",
    "large-v3": "Systran/faster-whisper-large-v3",
}


def resolve_model_path(model_name: str) -> str:
    if os.path.isdir(model_name):
        return model_name

    repo_id = MODEL_REPOS.get(model_name, f"Systran/faster-whisper-{model_name}")
    local_dir = os.path.join(tempfile.gettempdir(), "faster-whisper-models", model_name)
    os.makedirs(local_dir, exist_ok=True)

    # Use real file copies on Windows to avoid symlink privilege failures (WinError 1314).
    snapshot_download(
        repo_id=repo_id,
        local_dir=local_dir,
        local_dir_use_symlinks=False,
    )
    return local_dir


def main() -> int:
    parser = argparse.ArgumentParser(description="Transcribe audio with faster-whisper")
    parser.add_argument("--input", required=True, help="Input audio file path")
    parser.add_argument("--model", default="tiny", help="Whisper model name (tiny/base/small/medium/large-v3)")
    args = parser.parse_args()

    try:
        model_path = resolve_model_path(args.model)
        model = WhisperModel(model_path, device="cpu", compute_type="int8")
        segments_iter, info = model.transcribe(
            args.input,
            task="transcribe",
            beam_size=1,
            best_of=1,
            vad_filter=True,
            condition_on_previous_text=False,
        )

        segments = []
        for seg in segments_iter:
            text = (seg.text or "").strip()
            if not text:
                continue
            segments.append(
                {
                    "start": float(seg.start),
                    "end": float(seg.end),
                    "text": text,
                }
            )

        output = {
            "language": getattr(info, "language", "unknown"),
            "segments": segments,
        }
        sys.stdout.write(json.dumps(output, ensure_ascii=True))
        return 0
    except Exception as exc:
        sys.stderr.write(f"transcription_error: {exc}\n")
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
