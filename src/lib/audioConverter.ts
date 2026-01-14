/**
 * Converte áudio WebM/Opus para MP3 compatível com Meta WhatsApp API
 */

// @ts-ignore - lamejs não tem tipos
import lamejs from '@breezystack/lamejs';

export async function convertWebmToMp3(webmBlob: Blob): Promise<Blob> {
  console.log('Iniciando conversão de áudio webm para mp3...', { size: webmBlob.size, type: webmBlob.type });
  
  // Decodificar o áudio webm usando AudioContext
  const audioContext = new AudioContext({ sampleRate: 44100 });
  
  try {
    const arrayBuffer = await webmBlob.arrayBuffer();
    const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
    
    console.log('Áudio decodificado:', { 
      duration: audioBuffer.duration, 
      numberOfChannels: audioBuffer.numberOfChannels,
      sampleRate: audioBuffer.sampleRate 
    });
    
    // Converter para MP3 usando lamejs
    const mp3Blob = encodeToMp3(audioBuffer);
    
    console.log('Conversão concluída:', { size: mp3Blob.size, type: mp3Blob.type });
    
    return mp3Blob;
  } finally {
    await audioContext.close();
  }
}

function encodeToMp3(audioBuffer: AudioBuffer): Blob {
  const channels = audioBuffer.numberOfChannels;
  const sampleRate = audioBuffer.sampleRate;
  const mp3encoder = new lamejs.Mp3Encoder(channels, sampleRate, 128);
  
  const mp3Data: Uint8Array[] = [];
  const sampleBlockSize = 1152; // Frame size for MP3
  
  // Obter dados dos canais
  const leftChannel = audioBuffer.getChannelData(0);
  const rightChannel = channels > 1 ? audioBuffer.getChannelData(1) : leftChannel;
  
  // Converter Float32 para Int16
  const leftSamples = convertFloat32ToInt16(leftChannel);
  const rightSamples = convertFloat32ToInt16(rightChannel);
  
  // Codificar em blocos
  for (let i = 0; i < leftSamples.length; i += sampleBlockSize) {
    const leftChunk = leftSamples.subarray(i, i + sampleBlockSize);
    const rightChunk = rightSamples.subarray(i, i + sampleBlockSize);
    
    const mp3buf = channels === 1 
      ? mp3encoder.encodeBuffer(leftChunk)
      : mp3encoder.encodeBuffer(leftChunk, rightChunk);
    
    if (mp3buf.length > 0) {
      mp3Data.push(new Uint8Array(mp3buf.buffer));
    }
  }
  
  // Flush final
  const mp3End = mp3encoder.flush();
  if (mp3End.length > 0) {
    mp3Data.push(new Uint8Array(mp3End.buffer));
  }
  
  // Concatenar todos os buffers em um único ArrayBuffer
  const totalLength = mp3Data.reduce((acc, arr) => acc + arr.length, 0);
  const result = new Uint8Array(totalLength);
  let offset = 0;
  for (const arr of mp3Data) {
    result.set(arr, offset);
    offset += arr.length;
  }
  
  // Criar blob MP3
  return new Blob([result.buffer], { type: 'audio/mpeg' });
}

function convertFloat32ToInt16(float32Array: Float32Array): Int16Array {
  const int16Array = new Int16Array(float32Array.length);
  for (let i = 0; i < float32Array.length; i++) {
    // Clamp entre -1 e 1, depois converter para Int16
    const s = Math.max(-1, Math.min(1, float32Array[i]));
    int16Array[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
  }
  return int16Array;
}
