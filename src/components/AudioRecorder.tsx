import { useState, useRef, useEffect } from 'react';
import { Mic, Square, Send, X, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { convertWebmToMp3 } from '@/lib/audioConverter';

interface AudioRecorderProps {
  onSend: (audioBase64: string, duration: number, mimeType?: string) => Promise<void>;
  disabled?: boolean;
}

export function AudioRecorder({ onSend, disabled }: AudioRecorderProps) {
  const [isRecording, setIsRecording] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [duration, setDuration] = useState(0);
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
  const [isSending, setIsSending] = useState(false);
  
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  useEffect(() => {
    return () => {
      stopTimer();
      stopMediaStream();
    };
  }, []);

  const stopTimer = () => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  };

  const stopMediaStream = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
  };

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ 
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          sampleRate: 44100,
        } 
      });
      
      streamRef.current = stream;
      chunksRef.current = [];
      
      const mediaRecorder = new MediaRecorder(stream, {
        mimeType: MediaRecorder.isTypeSupported('audio/webm;codecs=opus') 
          ? 'audio/webm;codecs=opus' 
          : 'audio/webm'
      });
      
      mediaRecorderRef.current = mediaRecorder;

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) {
          chunksRef.current.push(e.data);
        }
      };

      mediaRecorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: 'audio/webm' });
        setAudioBlob(blob);
        stopMediaStream();
      };

      mediaRecorder.start(100);
      setIsRecording(true);
      setDuration(0);
      
      timerRef.current = setInterval(() => {
        setDuration(prev => prev + 1);
      }, 1000);
      
    } catch (error) {
      console.error('Erro ao acessar microfone:', error);
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
    }
    setIsRecording(false);
    setIsPaused(false);
    stopTimer();
  };

  const cancelRecording = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
    }
    setIsRecording(false);
    setIsPaused(false);
    setAudioBlob(null);
    setDuration(0);
    stopTimer();
    stopMediaStream();
    chunksRef.current = [];
  };

  const sendAudio = async () => {
    if (!audioBlob) return;
    
    setIsSending(true);
    try {
      // Converter webm para MP3 (compatível com Meta WhatsApp API)
      console.log('Convertendo áudio webm para MP3...');
      const mp3Blob = await convertWebmToMp3(audioBlob);
      console.log('Conversão concluída:', { originalSize: audioBlob.size, mp3Size: mp3Blob.size });
      
      // Converter blob para base64
      const reader = new FileReader();
      reader.readAsDataURL(mp3Blob);
      
      reader.onloadend = async () => {
        const base64 = reader.result as string;
        // Remover o prefixo "data:audio/mpeg;base64,"
        const base64Data = base64.split(',')[1];
        
        await onSend(base64Data, duration, 'audio/mpeg');
        
        setAudioBlob(null);
        setDuration(0);
        setIsSending(false);
      };
    } catch (error) {
      console.error('Erro ao enviar áudio:', error);
      setIsSending(false);
    }
  };

  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  // Estado: não gravando e sem áudio
  if (!isRecording && !audioBlob) {
    return (
      <button
        onClick={startRecording}
        disabled={disabled}
        className={cn(
          "p-2.5 rounded-full transition-colors",
          "bg-muted hover:bg-muted/80 text-muted-foreground hover:text-foreground",
          disabled && "opacity-50 cursor-not-allowed"
        )}
        title="Gravar áudio"
      >
        <Mic className="h-5 w-5" />
      </button>
    );
  }

  // Estado: gravando
  if (isRecording) {
    return (
      <div className="flex items-center gap-2 bg-destructive/10 rounded-full px-3 py-1.5 animate-pulse">
        <div className="flex items-center gap-2">
          <div className="h-2 w-2 rounded-full bg-destructive animate-pulse" />
          <span className="text-sm font-medium text-destructive">
            {formatDuration(duration)}
          </span>
        </div>
        
        <button
          onClick={cancelRecording}
          className="p-1.5 rounded-full hover:bg-destructive/20 text-destructive"
          title="Cancelar"
        >
          <X className="h-4 w-4" />
        </button>
        
        <button
          onClick={stopRecording}
          className="p-1.5 rounded-full bg-destructive text-destructive-foreground hover:bg-destructive/90"
          title="Parar gravação"
        >
          <Square className="h-4 w-4" />
        </button>
      </div>
    );
  }

  // Estado: áudio gravado, pronto para enviar
  if (audioBlob) {
    return (
      <div className="flex items-center gap-2 bg-primary/10 rounded-full px-3 py-1.5">
        <span className="text-sm font-medium text-primary">
          🎤 {formatDuration(duration)}
        </span>
        
        <button
          onClick={cancelRecording}
          disabled={isSending}
          className="p-1.5 rounded-full hover:bg-destructive/20 text-destructive"
          title="Cancelar"
        >
          <X className="h-4 w-4" />
        </button>
        
        <button
          onClick={sendAudio}
          disabled={isSending}
          className="p-1.5 rounded-full bg-primary text-primary-foreground hover:bg-primary/90"
          title="Enviar áudio"
        >
          {isSending ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Send className="h-4 w-4" />
          )}
        </button>
      </div>
    );
  }

  return null;
}
