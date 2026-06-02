/**
 * SGF 2026 — Geolocation Wrapper
 * Usa navigator.geolocation (API nativa do browser).
 */

export interface Coordinates {
  latitude: number;
  longitude: number;
  accuracy: number;
}

/**
 * Obtém a localização atual do dispositivo.
 * Solicita permissão automaticamente.
 */
export function getCurrentLocation(): Promise<Coordinates> {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error('Geolocalização não suportada neste dispositivo'));
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        resolve({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          accuracy: position.coords.accuracy,
        });
      },
      (error) => {
        switch (error.code) {
          case error.PERMISSION_DENIED:
            reject(new Error('Permissão de localização negada. Ative nas configurações do navegador.'));
            break;
          case error.POSITION_UNAVAILABLE:
            reject(new Error('Localização indisponível. Tente novamente.'));
            break;
          case error.TIMEOUT:
            reject(new Error('Tempo esgotado ao obter localização.'));
            break;
          default:
            reject(new Error('Erro ao obter localização.'));
        }
      },
      {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 30000,
      },
    );
  });
}
