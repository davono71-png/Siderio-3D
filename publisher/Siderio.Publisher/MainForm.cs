using System.Diagnostics;
using System.Text.Json.Nodes;

namespace Siderio.Publisher;

public sealed class MainForm : Form
{
    private readonly TextBox _folder = new();
    private readonly Button _browse = new() { Text = "Sfoglia…" };
    private readonly TextBox _job = new();
    private readonly TextBox _client = new();
    private readonly TextBox _title = new();
    private readonly TextBox _notes = new();
    private readonly TextBox _log = new() { Multiline = true, ReadOnly = true, ScrollBars = ScrollBars.Vertical };
    private readonly Button _read = new() { Text = "1. Leggi assieme aperto" };
    private readonly Button _export = new() { Text = "2. Esporta cartella" };

    public MainForm()
    {
        Text = "Siderio — Esporta visualizzazione";
        AutoScaleMode = AutoScaleMode.Dpi;
        MinimumSize = new Size(860, 720);
        Size = new Size(920, 760);
        StartPosition = FormStartPosition.CenterScreen;
        Font = new Font("Segoe UI", 12f);
        BackColor = Color.FromArgb(18, 21, 26);
        ForeColor = Color.FromArgb(232, 237, 242);
        Padding = new Padding(20);

        var root = new TableLayoutPanel
        {
            Dock = DockStyle.Fill,
            ColumnCount = 1,
            RowCount = 3,
            GrowStyle = TableLayoutPanelGrowStyle.FixedSize,
        };
        root.RowStyles.Add(new RowStyle(SizeType.AutoSize));
        root.RowStyles.Add(new RowStyle(SizeType.Absolute, 96));
        root.RowStyles.Add(new RowStyle(SizeType.Percent, 100));

        root.Controls.Add(BuildFields(), 0, 0);
        root.Controls.Add(BuildButtons(), 0, 1);
        StyleLog(_log);
        root.Controls.Add(_log, 0, 2);
        Controls.Add(root);

        _browse.Click += (_, _) => BrowseFolder();
        _read.Click += (_, _) => ReadAssembly();
        _export.Click += (_, _) => ExportPackage();
        Log("Scegli la cartella di destinazione. Solid Edge deve essere aperto sull'assieme.");
    }

    private Control BuildFields()
    {
        var fields = new TableLayoutPanel
        {
            Dock = DockStyle.Top,
            AutoSize = true,
            ColumnCount = 2,
            Padding = new Padding(0, 0, 0, 8),
        };
        fields.ColumnStyles.Add(new ColumnStyle(SizeType.Absolute, 210));
        fields.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 100));

        var folderRow = new TableLayoutPanel { Dock = DockStyle.Fill, ColumnCount = 2, Height = 40 };
        folderRow.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 100));
        folderRow.ColumnStyles.Add(new ColumnStyle(SizeType.AutoSize));
        StyleField(_folder);
        StyleSecondary(_browse);
        _folder.Dock = DockStyle.Fill;
        folderRow.Controls.Add(_folder, 0, 0);
        folderRow.Controls.Add(_browse, 1, 0);

        AddField(fields, "Cartella di destinazione", folderRow);
        AddField(fields, "Commessa", StyleField(_job));
        AddField(fields, "Cliente", StyleField(_client));
        AddField(fields, "Titolo", StyleField(_title));
        AddField(fields, "Note", StyleField(_notes));
        return fields;
    }

    private Control BuildButtons()
    {
        var buttons = new FlowLayoutPanel
        {
            Dock = DockStyle.Fill,
            WrapContents = false,
            Padding = new Padding(0, 12, 0, 12),
        };
        StylePrimary(_read);
        StylePrimary(_export);
        buttons.Controls.Add(_read);
        buttons.Controls.Add(_export);
        return buttons;
    }

    private static void AddField(TableLayoutPanel fields, string caption, Control field)
    {
        var row = fields.RowCount++;
        fields.RowStyles.Add(new RowStyle(SizeType.Absolute, 48));
        var label = new Label
        {
            Text = caption,
            Dock = DockStyle.Fill,
            TextAlign = ContentAlignment.MiddleLeft,
            ForeColor = Color.FromArgb(232, 237, 242),
            AutoSize = false,
        };
        field.Dock = DockStyle.Fill;
        fields.Controls.Add(label, 0, row);
        fields.Controls.Add(field, 1, row);
    }

    private static TextBox StyleField(TextBox box)
    {
        box.BackColor = Color.FromArgb(15, 18, 22);
        box.ForeColor = Color.FromArgb(232, 237, 242);
        box.BorderStyle = BorderStyle.FixedSingle;
        box.Font = new Font("Segoe UI", 12f);
        return box;
    }

    private static void StylePrimary(Button button)
    {
        button.AutoSize = true;
        button.MinimumSize = new Size(280, 52);
        button.Padding = new Padding(16, 8, 16, 8);
        button.Margin = new Padding(0, 0, 16, 0);
        button.Font = new Font("Segoe UI", 12f, FontStyle.Bold);
        button.BackColor = Color.FromArgb(215, 164, 65);
        button.ForeColor = Color.FromArgb(26, 20, 8);
        button.FlatStyle = FlatStyle.Flat;
        button.FlatAppearance.BorderSize = 0;
        button.UseVisualStyleBackColor = false;
        button.Cursor = Cursors.Hand;
    }

    private static void StyleSecondary(Button button)
    {
        button.AutoSize = true;
        button.MinimumSize = new Size(130, 40);
        button.Margin = new Padding(8, 0, 0, 0);
        button.Font = new Font("Segoe UI", 11f, FontStyle.Bold);
        button.BackColor = Color.FromArgb(58, 66, 76);
        button.ForeColor = Color.FromArgb(232, 237, 242);
        button.FlatStyle = FlatStyle.Flat;
        button.FlatAppearance.BorderSize = 0;
        button.UseVisualStyleBackColor = false;
        button.Cursor = Cursors.Hand;
    }

    private static void StyleLog(TextBox log)
    {
        log.BackColor = Color.FromArgb(12, 14, 18);
        log.ForeColor = Color.FromArgb(200, 210, 220);
        log.BorderStyle = BorderStyle.FixedSingle;
        log.Font = new Font("Consolas", 11f);
        log.Dock = DockStyle.Fill;
    }

    private void BrowseFolder()
    {
        using var dialog = new FolderBrowserDialog
        {
            Description = "Scegli dove creare la cartella del pacchetto Siderio",
            UseDescriptionForTitle = true,
        };
        if (!string.IsNullOrWhiteSpace(_folder.Text) && Directory.Exists(_folder.Text))
        {
            dialog.SelectedPath = _folder.Text;
        }
        if (dialog.ShowDialog(this) == DialogResult.OK)
        {
            _folder.Text = dialog.SelectedPath;
        }
    }

    private void ReadAssembly()
    {
        try
        {
            var draft = SolidEdgeBridge.ReadActiveAssembly();
            if (string.IsNullOrWhiteSpace(_job.Text)) _job.Text = draft.JobCode;
            if (string.IsNullOrWhiteSpace(_client.Text)) _client.Text = draft.ClientName;
            if (string.IsNullOrWhiteSpace(_title.Text)) _title.Text = draft.Title;
            var used = draft.UsedMaterialNames();
            var usedText = used.Count == 0 ? "nessuno sulle parti" : string.Join(", ", used);
            Log($"Letto {draft.DocumentName}: {draft.Occurrences.Count} occorrenze, {draft.Configurations.Count} configurazioni.");
            Log($"Materiali (tabella SE, distinti): {used.Count} — {usedText}");
        }
        catch (Exception ex)
        {
            Log(ex.Message);
            MessageBox.Show(ex.Message, "Solid Edge", MessageBoxButtons.OK, MessageBoxIcon.Warning);
        }
    }

    private void ExportPackage()
    {
        if (string.IsNullOrWhiteSpace(_job.Text) || string.IsNullOrWhiteSpace(_client.Text) || string.IsNullOrWhiteSpace(_title.Text))
        {
            MessageBox.Show("Compila commessa, cliente e titolo.", "Siderio");
            return;
        }
        if (string.IsNullOrWhiteSpace(_folder.Text))
        {
            MessageBox.Show("Scegli la cartella di destinazione.", "Siderio");
            return;
        }

        _export.Enabled = false;
        try
        {
            Log("Lettura assieme da Solid Edge…");
            var draft = SolidEdgeBridge.ReadActiveAssembly();
            var dest = CreatePackageDirectory(_folder.Text.Trim(), _job.Text.Trim(), draft.DocumentName);
            Directory.CreateDirectory(dest);
            var stepPath = Path.Combine(dest, "model.stp");
            Log("Esportazione STEP ufficiale (SaveAs)…");
            SolidEdgeBridge.ExportActiveAssemblyToStep(stepPath);

            var manifest = SolidEdgeBridge.ToManifest(draft, _job.Text.Trim(), _client.Text.Trim(), _title.Text.Trim(), _notes.Text.Trim());
            manifest["files"] = new JsonObject
            {
                ["step"] = "model.stp",
                ["manifest"] = "siderio.json",
            };
            File.WriteAllText(Path.Combine(dest, "siderio.json"), JsonUtil.Serialize(manifest));
            Log($"Esportato in:{Environment.NewLine}{dest}");
            var used = draft.UsedMaterialNames();
            var usedText = used.Count == 0 ? "nessuno sulle parti" : string.Join(", ", used);
            Log($"Configurazioni: {draft.Configurations.Count}. Materiali: {used.Count} ({usedText}). Apri questa cartella da Siderio (Apri pacchetto).");
            try { Process.Start("explorer.exe", dest); } catch { /* explorer opzionale */ }
            MessageBox.Show($"Cartella creata:\n{dest}", "Siderio");
        }
        catch (Exception ex)
        {
            Log(ex.Message);
            MessageBox.Show(ex.Message, "Esportazione", MessageBoxButtons.OK, MessageBoxIcon.Error);
        }
        finally
        {
            _export.Enabled = true;
        }
    }

    internal static string CreatePackageDirectory(string parent, string jobCode, string documentName)
    {
        var stem = Path.GetFileNameWithoutExtension(documentName);
        if (string.IsNullOrWhiteSpace(stem)) stem = "assieme";
        var raw = $"{jobCode}_{stem}";
        foreach (var invalid in Path.GetInvalidFileNameChars())
        {
            raw = raw.Replace(invalid, '-');
        }
        raw = raw.Replace('/', '-').Replace('\\', '-').Trim('-');
        if (raw.Length == 0) raw = "siderio-pacchetto";
        return Path.Combine(parent, raw);
    }

    private void Log(string message)
    {
        _log.AppendText($"[{DateTime.Now:HH:mm:ss}] {message}{Environment.NewLine}");
    }
}
