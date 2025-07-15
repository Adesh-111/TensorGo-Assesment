import React, { useRef, useState } from "react";
import io from "socket.io-client";
import "./App.css";

const SIGNAL_SERVER_URL = "http://localhost:5000";

const configuration = {
  iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
};

function App() {
  const [roomId, setRoomId] = useState("");
  const [inRoom, setInRoom] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const localVideoRef = useRef();
  const remoteVideoRef = useRef();
  const socketRef = useRef();
  const peerRef = useRef();
  const streamRef = useRef(null);

const handleJoin = async () => {
  setError('');
  setLoading(true);
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
    streamRef.current = stream;
    setInRoom(true);
    setLoading(false);
    setTimeout(() => {
      if (localVideoRef.current) {
        localVideoRef.current.srcObject = stream;
      }
    }, 100);
    socketRef.current = io(SIGNAL_SERVER_URL);
    socketRef.current.emit('join-room', { roomId });
    socketRef.current.on('ready', () => {
      createPeer(stream, true);
    });
    socketRef.current.on('user-joined', () => {
      //non-initiator
      createPeer(stream, false);
    });

    socketRef.current.on('signal', async ({ data }) => {
      if (!peerRef.current) {
        console.error('Peer connection not established');
        return;
      }
      try {
        if (data.sdp) {
          await peerRef.current.setRemoteDescription(new RTCSessionDescription(data.sdp));
          if (data.sdp.type === 'offer') {
            const answer = await peerRef.current.createAnswer();
            await peerRef.current.setLocalDescription(answer);
            socketRef.current.emit('signal', { roomId, data: { sdp: peerRef.current.localDescription } });
          }
        } else if (data.candidate) {
          await peerRef.current.addIceCandidate(new RTCIceCandidate(data.candidate));
        }
      } catch (error) {
        console.error('Error handling signal:', error);
      }
    });
    socketRef.current.on('user-left', () => {
      setError('Other user left the room.');
      if (remoteVideoRef.current) {
        remoteVideoRef.current.srcObject = null;
      }
      peerRef.current?.close();
      peerRef.current = null;
    });
  } catch (e) {
    console.error('getUserMedia error:', e);
    setError(`Could not access camera/microphone: ${e.message}`);
    setLoading(false);
  }
};

  const createPeer = (stream, initiator) => {
    peerRef.current = new RTCPeerConnection(configuration);

    stream
      .getTracks()
      .forEach((track) => peerRef.current.addTrack(track, stream));

    peerRef.current.ontrack = (event) => {
      console.log('Remote stream received:', event.streams[0]);
      if (remoteVideoRef.current) {
        remoteVideoRef.current.srcObject = event.streams[0];
      }
    };

    peerRef.current.onicecandidate = (event) => {
      if (event.candidate) {
        socketRef.current.emit("signal", {
          roomId,
          data: { candidate: event.candidate },
        });
      }
    };

    peerRef.current.onconnectionstatechange = () => {
      console.log('Connection state:', peerRef.current.connectionState);
      if (peerRef.current.connectionState === 'failed') {
        setError('Connection failed. Please try again.');
      }
    };

    peerRef.current.oniceconnectionstatechange = () => {
      console.log('ICE connection state:', peerRef.current.iceConnectionState);
    };

    if (initiator) {
      peerRef.current.onnegotiationneeded = async () => {
        try {
          const offer = await peerRef.current.createOffer();
          await peerRef.current.setLocalDescription(offer);
          socketRef.current.emit("signal", {
            roomId,
            data: { sdp: peerRef.current.localDescription },
          });
        } catch (error) {
          console.error('Error creating offer:', error);
        }
      };
    }
  };

  const handleLeave = () => {
    if (socketRef.current) {
      socketRef.current.disconnect();
    }
    if (peerRef.current) {
      peerRef.current.close();
      peerRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
    if (localVideoRef.current) {
      localVideoRef.current.srcObject = null;
    }
    if (remoteVideoRef.current) {
      remoteVideoRef.current.srcObject = null;
    }
    setInRoom(false);
    setError('');
  };

  return (
    <div className="container">
      <h2>Real-Time Two-Way Video Streaming</h2>
      {!inRoom && (
        <div>
          <input
            type="text"
            placeholder="Enter Room ID"
            value={roomId}
            onChange={(e) => setRoomId(e.target.value)}
          />
          <button onClick={handleJoin} disabled={loading || !roomId}>
            Join
          </button>
          {loading && <p>Loading...</p>}
          {error && <p className="error">{error}</p>}
        </div>
      )}
      {inRoom && (
        <div className="video-section">
          <div>
            <h4>Local Video</h4>
            <video ref={localVideoRef} autoPlay muted playsInline />
          </div>
          <div>
            <h4>Remote Video</h4>
            <video ref={remoteVideoRef} autoPlay playsInline />
          </div>
          <button onClick={handleLeave}>Leave Room</button>
          {error && <p className="error">{error}</p>}
        </div>
      )}
    </div>
  );
}

export default App;