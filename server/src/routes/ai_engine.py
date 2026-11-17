import ollama
import cv2
import os
import random
from PIL import Image

class AntigravityAI:
    def __init__(self, model_name='ahmadwaqar/smolvlm2-256m-video:q8_0'):
        self.model_name = model_name
        self.verify_model()

    def verify_model(self):
        """Verify that the required model is installed in Ollama."""
        try:
            models = ollama.list()
            # Check if our model is in the list of downloaded models
            installed = any(m['name'].startswith(self.model_name) for m in models['models'])
            if not installed:
                print(f"⚠️ Model {self.model_name} not found. Pulling now...")
                ollama.pull(self.model_name)
        except Exception as e:
            print(f"❌ Error connecting to Ollama: {e}")

    def extract_frame(self, video_path, frame_number=1):
        """Extracts a single low-res frame to save RAM."""
        cap = cv2.VideoCapture(video_path)
        # Seek to the middle of the video
        frame_count = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
        cap.set(cv2.CAP_PROP_POS_FRAMES, frame_count // 2)
        
        success, frame = cap.read()
        if success:
            # Resize to 384x384 for smolvlm efficiency
            frame = cv2.resize(frame, (384, 384))
            # Convert BGR to RGB
            frame = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
            # Save as temporary image
            temp_path = "temp_analysis_frame.jpg"
            Image.fromarray(frame).save(temp_path)
            cap.release()
            return temp_path
        cap.release()
        return None

    def analyze_clip(self, video_path):
        """Analyzes a clip and returns concise keywords."""
        frame_path = self.extract_frame(video_path)
        if not frame_path:
            return "Analysis Failed: No frame extracted"

        try:
            response = ollama.chat(
                model=self.model_name,
                messages=[{
                    'role': 'user',
                    'content': 'Describe this movie scene in 10 concise keywords: characters, action, location, objects, mood.',
                    'images': [frame_path]
                }],
            )
            # Clean up temp file
            if os.path.exists(frame_path):
                os.remove(frame_path)
            return response.message.content
        except Exception as e:
            return f"Error: {str(e)}"

    def get_copyright_bypass_filter(self):
        """Returns a randomized FFmpeg filter string to break content IDs."""
        transforms = [
            "crop=iw*0.95:ih*0.95,scale=1920:1080", # Micro-zoom
            "eq=brightness=0.02:contrast=1.05:saturation=1.1", # Color shift
            "hflip", # Mirroring
        ]
        # Pick a random one and add speed shift
        chosen = random.choice(transforms)
        return f"{chosen},setpts=0.99*PTS"

# Example Integration Usage:
if __name__ == "__main__":
    ai = AntigravityAI()
    # test_clip = "movie_clip_01.mp4" 
    # print(f"Analysis: {ai.analyze_clip(test_clip)}")
