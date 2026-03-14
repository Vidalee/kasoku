"use client";
import { useState } from "react";
import {
  Box, Typography, Button, TextField, Stack, Card, CardContent, Stepper, Step, StepLabel,
  FormControl, InputLabel, Select, MenuItem, Checkbox, FormControlLabel,
  Chip, Alert, LinearProgress, Divider, ToggleButton, ToggleButtonGroup, Table,
  TableBody, TableCell, TableHead, TableRow, Paper,
} from "@mui/material";
import FolderOpenIcon from "@mui/icons-material/FolderOpen";
import UploadFileIcon from "@mui/icons-material/UploadFile";
import CheckCircleIcon from "@mui/icons-material/CheckCircle";

interface AnkiDeck { id: string; name: string; cardCount: number; }
interface NoteType { id: string; name: string; fields: string[]; }
interface AnalyzeResult {
  sessionId: string;
  decks: AnkiDeck[];
  noteTypes: NoteType[];
  totalNotes: number;
  preview: { fields: Record<string, string> }[];
}
interface Mapping { kanji: string; furigana: string; meaning: string; sentences: string; }

const STEPS = ["Locate file", "Configure", "Done"];

export default function ImportPage() {
  const [step, setStep] = useState(0);
  const [filePath, setFilePath] = useState("");
  const [uploadMode, setUploadMode] = useState<"upload" | "path">("upload");
  const [analysis, setAnalysis] = useState<AnalyzeResult | null>(null);
  const [selectedDeckIds, setSelectedDeckIds] = useState<string[]>([]);
  const [mapping, setMapping] = useState<Mapping>({ kanji: "", furigana: "", meaning: "", sentences: "" });
  const [deckNameMode, setDeckNameMode] = useState<"full" | "last">("last");
  const [jlptLevel, setJlptLevel] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [importing, setImporting] = useState(false);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [result, setResult] = useState<{ imported: number; skipped: number } | null>(null);
  const [error, setError] = useState("");

  const allFields = analysis
    ? [...new Set(analysis.noteTypes.flatMap((nt) => nt.fields))]
    : [];

  async function handleAnalyze(file?: File) {
    setError("");
    setLoading(true);
    try {
      let res: globalThis.Response;
      if (file) {
        res = await fetch("/api/import/anki/analyze", {
          method: "POST",
          headers: { "Content-Type": "application/octet-stream", "x-filename": file.name },
          body: file,
        });
      } else {
        if (!filePath.trim()) { setLoading(false); return; }
        res = await fetch("/api/import/anki/analyze", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ filePath: filePath.trim() }),
        });
      }
      const data = await res.json();
      if (!res.ok) { setError(data.error ?? "Failed to read file"); setLoading(false); return; }
      setAnalysis(data);
      setSelectedDeckIds(data.decks.map((d: AnkiDeck) => d.id));
      setMapping(autoDetect(data.noteTypes));
      setStep(1);
    } catch {
      setError("Failed — check the file and try again");
    }
    setLoading(false);
  }

  async function handleImport() {
    if (!analysis) return;
    setError("");
    setImporting(true);
    try {
      const res = await fetch("/api/import/anki/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId: analysis.sessionId, selectedDeckIds, mapping, deckNameMode, jlptLevel: jlptLevel ? parseInt(jlptLevel) : null }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error ?? "Import failed"); setImporting(false); return; }
      setResult(data);
      setStep(2);
    } catch {
      setError("Import failed");
    }
    setImporting(false);
  }

  async function refreshPreview() {
    if (!analysis) return;
    setPreviewLoading(true);
    try {
      const res = await fetch("/api/import/anki/preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId: analysis.sessionId, selectedDeckIds }),
      });
      const data = await res.json();
      if (res.ok) setAnalysis((a) => a ? { ...a, preview: data.preview } : a);
      else setError(data.error ?? "Failed to refresh preview");
    } catch {
      setError("Failed to refresh preview");
    }
    setPreviewLoading(false);
  }

  function toggleDeck(id: string) {
    setSelectedDeckIds((ids) => ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id]);
  }

  const totalSelected = analysis?.decks
    .filter((d) => selectedDeckIds.includes(d.id))
    .reduce((sum, d) => sum + d.cardCount, 0) ?? 0;

  return (
    <Box sx={{ maxWidth: 720, mx: "auto" }}>
      <Typography variant="h5" fontWeight={700} mb={1}>Import from Anki</Typography>
      <Typography variant="body2" color="text.secondary" mb={3}>
        Import vocabulary from any .apkg file. SRS progress starts fresh using FSRS.
      </Typography>

      <Stepper activeStep={step} sx={{ mb: 4 }}>
        {STEPS.map((label) => <Step key={label}><StepLabel>{label}</StepLabel></Step>)}
      </Stepper>

      {error && <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError("")}>{error}</Alert>}

      {/* ── Step 0: File path ── */}
      {step === 0 && (
        <Card variant="outlined">
          <CardContent>
            <Stack direction="row" alignItems="center" justifyContent="space-between" mb={2}>
              <Stack direction="row" alignItems="center" gap={1}>
                {uploadMode === "upload" ? <UploadFileIcon color="action" /> : <FolderOpenIcon color="action" />}
                <Typography variant="subtitle1" fontWeight={600}>
                  {uploadMode === "upload" ? "Upload your .apkg file" : "Enter the path to your .apkg file"}
                </Typography>
              </Stack>
              <ToggleButtonGroup size="small" value={uploadMode} exclusive onChange={(_, v) => v && setUploadMode(v)}>
                <ToggleButton value="upload" sx={{ py: 0.25, fontSize: 11 }}>Upload</ToggleButton>
                <ToggleButton value="path" sx={{ py: 0.25, fontSize: 11 }}>Server path</ToggleButton>
              </ToggleButtonGroup>
            </Stack>

            {uploadMode === "upload" ? (
              <>
                <Typography variant="body2" color="text.secondary" mb={2}>
                  Choose any .apkg file from your device. Large files are streamed directly to the server.
                </Typography>
                <Button
                  variant="outlined"
                  component="label"
                  startIcon={<UploadFileIcon />}
                  disabled={loading}
                >
                  {loading ? "Reading…" : "Choose .apkg file"}
                  <input
                    type="file"
                    accept=".apkg"
                    hidden
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) handleAnalyze(file);
                    }}
                  />
                </Button>
              </>
            ) : (
              <>
                <Typography variant="body2" color="text.secondary" mb={2}>
                  The file must be accessible on the server. For local dev, use the full path on this machine.
                </Typography>
                <Stack direction="row" gap={1}>
                  <TextField
                    fullWidth
                    size="small"
                    placeholder="/home/user/Downloads/deck.apkg"
                    value={filePath}
                    onChange={(e) => setFilePath(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && handleAnalyze()}
                    autoFocus
                  />
                  <Button variant="contained" onClick={() => handleAnalyze()} disabled={loading || !filePath.trim()}>
                    {loading ? "Reading…" : "Analyse"}
                  </Button>
                </Stack>
              </>
            )}

            {loading && <LinearProgress sx={{ mt: 2 }} />}
          </CardContent>
        </Card>
      )}

      {/* ── Step 1: Configure ── */}
      {step === 1 && analysis && (
        <Stack gap={3}>
          <Card variant="outlined">
            <CardContent>
              <Stack direction="row" alignItems="center" justifyContent="space-between" mb={1}>
                <Typography variant="subtitle1" fontWeight={600}>Select decks to import</Typography>
                <Button size="small" onClick={() =>
                  selectedDeckIds.length === analysis.decks.length
                    ? setSelectedDeckIds([])
                    : setSelectedDeckIds(analysis.decks.map((d) => d.id))
                }>
                  {selectedDeckIds.length === analysis.decks.length ? "Unselect all" : "Select all"}
                </Button>
              </Stack>
              <Stack gap={0.5} sx={{ maxHeight: 300, overflowY: "auto" }}>
                {analysis.decks.map((d) => (
                  <FormControlLabel
                    key={d.id}
                    control={<Checkbox checked={selectedDeckIds.includes(d.id)} onChange={() => toggleDeck(d.id)} size="small" />}
                    label={
                      <Stack direction="row" gap={1} alignItems="center">
                        <Typography variant="body2">{d.name.replace(/::/g, " › ")}</Typography>
                        <Chip label={`${d.cardCount}`} size="small" variant="outlined" />
                      </Stack>
                    }
                  />
                ))}
              </Stack>
              <Stack direction="row" alignItems="center" gap={2} mt={1.5} flexWrap="wrap">
                <Stack direction="row" alignItems="center" gap={1}>
                  <Typography variant="caption" color="text.secondary">Deck names:</Typography>
                  <ToggleButtonGroup size="small" value={deckNameMode} exclusive onChange={(_, v) => v && setDeckNameMode(v)}>
                    <ToggleButton value="last" sx={{ py: 0.25, fontSize: 11 }}>Last part</ToggleButton>
                    <ToggleButton value="full" sx={{ py: 0.25, fontSize: 11 }}>Full path</ToggleButton>
                  </ToggleButtonGroup>
                </Stack>
                <Stack direction="row" alignItems="center" gap={1}>
                  <Typography variant="caption" color="text.secondary">JLPT level:</Typography>
                  <ToggleButtonGroup size="small" value={jlptLevel} exclusive onChange={(_, v) => setJlptLevel(v ?? "")}>
                    {["5","4","3","2","1"].map((n) => (
                      <ToggleButton key={n} value={n} sx={{ py: 0.25, fontSize: 11 }}>N{n}</ToggleButton>
                    ))}
                  </ToggleButtonGroup>
                  {jlptLevel && <Typography variant="caption" color="text.secondary" sx={{ cursor: "pointer" }} onClick={() => setJlptLevel("")}>✕ clear</Typography>}
                </Stack>
              </Stack>
            </CardContent>
          </Card>

          <Card variant="outlined">
            <CardContent>
              <Typography variant="subtitle1" fontWeight={600} gutterBottom>Map fields</Typography>
              <Typography variant="body2" color="text.secondary" mb={2}>
                Which Anki field contains each piece of info?
              </Typography>
              <Stack direction={{ xs: "column", sm: "row" }} gap={2} flexWrap="wrap">
                {([
                  { key: "kanji",     label: "Kanji / Word *",      optional: false },
                  { key: "furigana",  label: "Reading (optional)",   optional: true  },
                  { key: "meaning",   label: "Meaning *",            optional: false },
                  { key: "sentences", label: "Sentences (optional)", optional: true  },
                ] as const).map(({ key, label, optional }) => (
                  <FormControl key={key} size="small" sx={{ flex: 1, minWidth: 160 }}>
                    <InputLabel>{label}</InputLabel>
                    <Select
                      value={mapping[key]}
                      label={label}
                      onChange={(e) => setMapping((m) => ({ ...m, [key]: e.target.value }))}
                    >
                      <MenuItem value="">{optional ? "(none)" : "(select)"}</MenuItem>
                      {allFields.map((f) => <MenuItem key={f} value={f}>{f}</MenuItem>)}
                    </Select>
                  </FormControl>
                ))}
              </Stack>
            </CardContent>
          </Card>

          {analysis.preview.length > 0 && (
            <Card variant="outlined">
              <CardContent>
                <Stack direction="row" alignItems="center" justifyContent="space-between" mb={1}>
                  <Typography variant="subtitle1" fontWeight={600}>Preview</Typography>
                  <Button size="small" onClick={refreshPreview} disabled={previewLoading || !selectedDeckIds.length}>
                    {previewLoading ? "Refreshing…" : "Refresh from selected decks"}
                  </Button>
                </Stack>
                <Paper variant="outlined" sx={{ overflow: "auto" }}>
                  <Table size="small">
                    <TableHead>
                      <TableRow>
                        <TableCell>Kanji / Word</TableCell>
                        <TableCell>Reading</TableCell>
                        <TableCell>Meaning</TableCell>
                        {mapping.sentences && <TableCell>Sentence</TableCell>}
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {analysis.preview.map((p, i) => {
                        const kanji = p.fields[mapping.kanji] ?? "";
                        const reading = mapping.furigana ? (p.fields[mapping.furigana] ?? "") : "";
                        const word = kanji || reading;
                        const shownReading = word === reading ? "" : reading;
                        return (
                          <TableRow key={i}>
                            <TableCell lang="ja">{word || "—"}</TableCell>
                            <TableCell lang="ja">{shownReading || "—"}</TableCell>
                            <TableCell sx={{ maxWidth: 240, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                              {p.fields[mapping.meaning] ?? "—"}
                            </TableCell>
                            {mapping.sentences && (
                              <TableCell lang="ja" sx={{ maxWidth: 200, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                {p.fields[mapping.sentences] ?? "—"}
                              </TableCell>
                            )}
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </Paper>
              </CardContent>
            </Card>
          )}

          <Divider />
          <Stack direction="row" justifyContent="space-between" alignItems="center">
            <Typography variant="body2" color="text.secondary">
              ~{totalSelected} cards from {selectedDeckIds.length} deck{selectedDeckIds.length !== 1 ? "s" : ""}
            </Typography>
            <Stack direction="row" gap={1}>
              <Button onClick={() => { setStep(0); setAnalysis(null); }}>Back</Button>
              <Button
                variant="contained"
                onClick={handleImport}
                disabled={importing || !selectedDeckIds.length || !mapping.kanji || !mapping.meaning}
              >
                {importing ? "Importing…" : `Import ${totalSelected} cards`}
              </Button>
            </Stack>
          </Stack>
          {importing && <LinearProgress />}
        </Stack>
      )}

      {/* ── Step 2: Done ── */}
      {step === 2 && result && (
        <Card variant="outlined">
          <CardContent sx={{ textAlign: "center", py: 6 }}>
            <CheckCircleIcon sx={{ fontSize: 56, color: "success.main", mb: 2 }} />
            <Typography variant="h6" gutterBottom>Import complete!</Typography>
            <Stack direction="row" gap={3} justifyContent="center" my={2}>
              <Box>
                <Typography variant="h4" fontWeight={700} color="primary">{result.imported}</Typography>
                <Typography variant="body2" color="text.secondary">words added</Typography>
              </Box>
              <Box>
                <Typography variant="h4" fontWeight={700} color="text.secondary">{result.skipped}</Typography>
                <Typography variant="body2" color="text.secondary">skipped (duplicates)</Typography>
              </Box>
            </Stack>
            <Stack direction="row" gap={2} justifyContent="center" mt={3}>
              <Button variant="outlined" onClick={() => { setStep(0); setAnalysis(null); setResult(null); setFilePath(""); }}>
                Import another
              </Button>
              <Button variant="contained" href="/vocabulary">View vocabulary</Button>
            </Stack>
          </CardContent>
        </Card>
      )}
    </Box>
  );
}

function autoDetect(noteTypes: NoteType[]): Mapping {
  const fields = [...new Set(noteTypes.flatMap((nt) => nt.fields))];
  const find = (names: string[]) => fields.find((f) => names.some(n => f.toLowerCase().includes(n))) ?? "";
  return {
    kanji: find(["kanji form", "expression", "word", "kanji", "front", "vocab", "japanese"]) || fields[0] || "",
    furigana: find(["reading without", "reading", "furigana", "kana", "hiragana"]) || fields[1] || "",
    meaning: find(["translation", "meaning", "definition", "english", "back", "gloss"]) || fields[2] || "",
    sentences: find(["phrase", "sentence", "example"]),
  };
}
