import pyttsx3
import argparse

def text_to_speech(text):
    engine = pyttsx3.init()
    engine.say(text)
    engine.runAndWait()

def main():
    parser = argparse.ArgumentParser(description='Text to Speech Converter')
    parser.add_argument('text', type=str, help='Text to convert to speech')
    args = parser.parse_args()
    text_to_speech(args.text)

if __name__ == "__main__":
    main()