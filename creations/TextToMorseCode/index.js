// Morse Code Converter

const readline = require('readline');

// Morse code character map
const morseCodeMap = {
  'A': '.-', 'B': '-...', 'C': '-.-.', 'D': '-..', 'E': '.',
  'F': '..-.', 'G': '--.', 'H': '....', 'I': '..', 'J': '.---',
  'K': '-.-', 'L': '.-..', 'M': '--', 'N': '-.', 'O': '---',
  'P': '.--.', 'Q': '--.-', 'R': '.-.', 'S': '...', 'T': '-',
  'U': '..-', 'V': '...-', 'W': '.--', 'X': '-..-', 'Y': '-.--',
  'Z': '--..',
  '0': '-----', '1': '.----', '2': '..---', '3': '...--',
  '4': '....-', '5': '.....', '6': '-....', '7': '--...',
  '8': '---..', '9': '----.',
  ' ': '/'
};

// Function to convert text to Morse code
function textToMorse(text) {
  return text.toUpperCase().split('').map(char => {
    return morseCodeMap[char] || '';
  }).join(' ');
}

// Set up the command-line interface
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

rl.question('Enter text to convert to Morse code: ', (input) => {
  const morseCode = textToMorse(input);
  console.log(`Morse code: ${morseCode}`);
  rl.close();
});