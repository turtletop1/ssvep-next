import React, { useState, useCallback, useEffect } from "react";
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Box,
  Alert,
} from "@mui/material";
import Editor from "react-simple-code-editor";
import { highlight, languages } from "prismjs";
import "prismjs/components/prism-json";
import "prismjs/themes/prism.css";
import { useTranslation } from "react-i18next";
import { useStore } from "../stores/canvasStore";
import { ProjectManager } from "../utils/projectManager";

interface JsonEditorModalProps {
  open: boolean;
  onClose: () => void;
}

export const JsonEditorModal: React.FC<JsonEditorModalProps> = ({
  open,
  onClose,
}) => {
  const { t } = useTranslation();
  const { items, globalConfig, loadProject } = useStore();

  const [jsonContent, setJsonContent] = useState("");
  const [error, setError] = useState("");

  // Initialize JSON content when modal opens
  useEffect(() => {
    if (open) {
      setJsonContent(ProjectManager.formatProjectToJson(items, globalConfig));
      setError("");
    }
  }, [open, items, globalConfig]);

  const handleJsonChange = useCallback((code: string) => {
    setJsonContent(code);
    setError("");
  }, []);

  const validateAndParseJson = useCallback(() => {
    return ProjectManager.parseProjectFromJson(jsonContent);
  }, [jsonContent]);

  const handleApply = useCallback(() => {
    try {
      const projectData = validateAndParseJson();
      loadProject(projectData.items, projectData.globalConfig);
      setError("");
    } catch (error) {
      setError((error as Error).message);
    }
  }, [validateAndParseJson, loadProject]);

  const handleSave = useCallback(() => {
    try {
      const projectData = validateAndParseJson();
      loadProject(projectData.items, projectData.globalConfig);
      setError("");
      onClose();
    } catch (error) {
      setError((error as Error).message);
    }
  }, [validateAndParseJson, loadProject, onClose]);

  return (
    <Dialog open={open} onClose={onClose} maxWidth="lg" fullWidth>
      <DialogTitle>{t("toolbox.editJson")}</DialogTitle>

      <DialogContent dividers>
        <Box
          sx={{
            display: "flex",
            flexDirection: "column",
            gap: 2,
            height: "80vh",
          }}
        >
          {/* JSON Editor */}
          <Box
            sx={{
              flex: 1,
              border: "1px solid #ccc",
              borderRadius: 1,
              overflow: "auto",
            }}
          >
            <Editor
              value={jsonContent}
              onValueChange={handleJsonChange}
              highlight={(code) => highlight(code, languages.json, "json")}
              padding={16}
              style={{
                fontFamily: '"Fira code", "Fira Mono", monospace',
                fontSize: 12,
                lineHeight: 1.5,
              }}
              placeholder={t("toolbox.jsonPlaceholder")}
            />
          </Box>

          {/* Error message */}
          {error && (
            <Alert severity="error" sx={{ mt: 1 }}>
              {error}
            </Alert>
          )}
        </Box>
      </DialogContent>

      <DialogActions>
        <Button onClick={onClose}>
          {t("toolbox.matrixDialog.cancel")}
        </Button>
        <Button onClick={handleApply} variant="outlined">
          {t("toolbox.apply")}
        </Button>
        <Button onClick={handleSave} variant="contained">
          {t("toolbox.save")}
        </Button>
      </DialogActions>
    </Dialog>
  );
};