const axios = require('axios');
const fs = require('fs');
const config = require('./config');

const baseUrl = config.BASE_URL;
const sessionsUrl = baseUrl;

const headers = {
  'accept': 'application/json',
  'Authorization': config.API_KEY
};

const MAX_SESSIONS = 1000; // Adjust this number as needed
const MAX_FAILURES = 3; // Maximum number of consecutive failures before stopping

async function getSessions() {
  try {
    const response = await axios.get(sessionsUrl, { headers });
    return response.data;
  } catch (error) {
    console.error('Error fetching sessions:', error.message);
    return null;
  }
}

async function getTranscriptContents(transcriptID) {
  try {
    const response = await axios.get(`${baseUrl}/${transcriptID}`, { headers });
    return response.data;
  } catch (error) {
    console.error(`Error fetching transcript contents for transcript ID ${transcriptID}:`, error.message);
    return null;
  }
}

function simplifyTranscript(transcript) {
  const simplifiedTranscript = [];

  for (const turn of transcript) {
    switch (turn.type) {
      case 'choice':
        if (turn.payload && turn.payload.payload && turn.payload.payload.buttons) {
          const buttons = turn.payload.payload.buttons.map(b => b.name).join(', ');
          simplifiedTranscript.push(`Agent: Presented options: ${buttons}`);
        }
        break;
      case 'text':
        if (turn.payload && turn.payload.payload && turn.payload.payload.message) {
          simplifiedTranscript.push(`Agent: ${turn.payload.payload.message}`);
        }
        break;
      case 'request':
        if (turn.payload.type === 'intent') {
          if (turn.payload.payload.query) {
            simplifiedTranscript.push(`User: ${turn.payload.payload.query}`);
          } else if (turn.payload.payload.label) {
            simplifiedTranscript.push(`User: Selected "${turn.payload.payload.label}"`);
          }
        } else if (turn.payload.type === 'launch') {
          simplifiedTranscript.push(`User: Started conversation`);
        }
        break;
      case 'intent':
        if (turn.payload.payload && turn.payload.payload.query) {
          simplifiedTranscript.push(`User: ${turn.payload.payload.query}`);
        }
        break;
    }
  }

  return simplifiedTranscript;
}

async function main() {
  console.log('Fetching sessions...');
  const allSessions = await getSessions();
  
  if (!allSessions || allSessions.length === 0) {
    console.log('No sessions found or error occurred.');
    return;
  }
  
  const sessions = allSessions.slice(0, MAX_SESSIONS);
  console.log(`Found ${allSessions.length} sessions. Processing ${sessions.length} sessions.`);
  
  const allTranscripts = [];
  let consecutiveFailures = 0;
  
  for (const session of sessions) {
    console.log(`Fetching transcript for session ID: ${session.sessionID} (Transcript ID: ${session._id})`);
    const contents = await getTranscriptContents(session._id);
    if (contents) {
      const simplifiedTranscript = simplifyTranscript(contents);
      allTranscripts.push({
        sessionInfo: {
          transcriptID: session._id,
          sessionID: session.sessionID,
          createdAt: session.createdAt,
          browser: session.browser,
          os: session.os,
          device: session.device
        },
        transcript: simplifiedTranscript
      });
      console.log(`Successfully fetched and simplified transcript for session ID: ${session.sessionID}`);
      consecutiveFailures = 0; // Reset failure count on success
    } else {
      console.log(`Failed to fetch transcript for session ID: ${session.sessionID}`);
      consecutiveFailures++;
      if (consecutiveFailures >= MAX_FAILURES) {
        console.log(`Stopping due to ${MAX_FAILURES} consecutive failures.`);
        break;
      }
    }
  }
  
  console.log(`Retrieved and simplified ${allTranscripts.length} transcripts.`);
  
  // Save all transcripts to a single file
  fs.writeFileSync('simplified_transcripts.json', JSON.stringify(allTranscripts, null, 2));
  console.log('All simplified transcripts saved to simplified_transcripts.json');
}

main().catch(console.error);