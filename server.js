import express from 'express';
import fs from 'fs';
import path from 'path';
import cors from 'cors';

const app = express();
const PORT = 3001;

// Fusion 360 Script Path
const FUSION_SCRIPT_PATH = "C:/Users/Admin-/AppData/Roaming/Autodesk/Autodesk Fusion 360/API/Scripts/Heat Exchanger/Heat Exchanger.py";

app.use(cors());
app.use(express.json());

app.post('/api/export-fusion', (req, res) => {
  const { pythonCode } = req.body;
  
  if (!pythonCode) {
    return res.status(400).json({ success: false, error: 'No Python code provided in payload.' });
  }

  try {
    const dir = path.dirname(FUSION_SCRIPT_PATH);
    
    // Create directories if they do not exist
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    // Write file sequentially with utf8 encoding
    fs.writeFileSync(FUSION_SCRIPT_PATH, pythonCode, 'utf8');
    
    console.log(`[SUCCESS] Regenerated Fusion 360 script at: ${FUSION_SCRIPT_PATH}`);
    res.json({ success: true, message: 'Successfully exported to Fusion 360' });
  } catch (error) {
    console.error('[ERROR] Failed to export script:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

app.listen(PORT, () => {
  console.log(`\n=================================================`);
  console.log(`Fusion 360 Export Server running on port ${PORT}`);
  console.log(`Listening for POST requests at http://localhost:${PORT}/api/export-fusion`);
  console.log(`Saving script to: ${FUSION_SCRIPT_PATH}`);
  console.log(`=================================================\n`);
});
