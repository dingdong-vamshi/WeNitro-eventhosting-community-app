export type DigiLockerClientEvent = 'completed' | 'closed';

export async function launchDigiLockerSession(
  _sessionId: string,
  _publicApiKey: string,
  _onEvent: (event: DigiLockerClientEvent) => void,
) {
  throw new Error('DigiLocker verification is currently available on the WeNitro web app.');
}
