/**
 * useDemoMode — Provides mock AI responses when no API key is configured.
 * Useful for testing UI without a backend connection and for hackathon
 * judges to preview the app quickly.
 */

import { useCallback, useRef } from 'react';

const DEMO_RESPONSES = [
  {
    delay: 1500,
    transcript: "Hi there! I'm Nova, your AI study assistant. I can see what you're showing me. Go ahead and point your camera at any homework problem or textbook page, and let's work through it together!",
  },
  {
    delay: 2000,
    transcript: "That's a great question! Let me break this down step by step. First, let's identify what we're working with here. Can you tell me what subject this is for?",
  },
  {
    delay: 1800,
    transcript: "Excellent! You're on the right track. The key concept to understand here is that we need to approach this systematically. Think about what information we already have.",
  },
  {
    delay: 1500,
    transcript: "That's correct! Great job! You're really getting the hang of this. Do you want to try the next problem, or would you like me to explain anything else about this one?",
  },
  {
    delay: 2000,
    transcript: "No worries, let me explain that again more simply. Think of it like this — we're just breaking a big problem into smaller, easier pieces. Does that make more sense now?",
  },
];

export default function useDemoMode() {
  const responseIndexRef = useRef(0);
  const timeoutRef = useRef(null);

  /**
   * Simulate a Nova response after a delay.
   * Returns via callbacks similar to the real WebSocket flow.
   */
  const simulateResponse = useCallback(({ onOutputTranscript, onTurnComplete }) => {
    const response = DEMO_RESPONSES[responseIndexRef.current % DEMO_RESPONSES.length];
    responseIndexRef.current += 1;

    // Simulate typing delay
    timeoutRef.current = setTimeout(() => {
      // Send transcript word by word for a realistic effect
      const words = response.transcript.split(' ');
      let wordIndex = 0;
      let accumulated = '';

      const interval = setInterval(() => {
        if (wordIndex < words.length) {
          accumulated += (wordIndex > 0 ? ' ' : '') + words[wordIndex];
          onOutputTranscript?.(words[wordIndex] + ' ');
          wordIndex++;
        } else {
          clearInterval(interval);
          onTurnComplete?.();
        }
      }, 80);
    }, response.delay);
  }, []);

  /**
   * Stop any pending demo response.
   */
  const cancelDemo = useCallback(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
  }, []);

  return { simulateResponse, cancelDemo };
}
