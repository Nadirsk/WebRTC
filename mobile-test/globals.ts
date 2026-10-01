import { registerGlobals } from 'react-native-webrtc';

// Exposes RTCPeerConnection, MediaStream, mediaDevices, ... as browser-style globals
// so the shared client library and mediasoup-client run unchanged.
registerGlobals();
