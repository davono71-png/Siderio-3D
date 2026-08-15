using System.Net.Http.Headers;
using System.Text;
using System.Text.Json.Nodes;

namespace Siderio.Publisher;

public sealed class MainForm : Form
{
    private readonly TextBox _server = new() { Text = "http://127.0.0.1:3000" };
    private readonly TextBox _job = new();
    private readonly TextBox _client = new();
    private readonly TextBox _title = new();
    private readonly TextBox _notes = new();
    private readonly TextBox _log = new() { Multiline = true, ReadOnly = true, ScrollBars = ScrollBars.Vertical };
    private readonly Button _read = new() { Text = "Leggi assieme aperto", Width = 180 };
    private readonly Button _publish = new() { Text = "Pubblica in officina", Width = 180 };

    public MainForm()
    {
        Text = "Siderio — Pubblica in officina";
        Width = 640;
        Height = 560;
        Font = new Font("Segoe UI", 10);
        var layout = new TableLayoutPanel { Dock = DockStyle.Fill, ColumnCount = 2, Padding = new Padding(12) };
        layout.ColumnStyles.Add(new ColumnStyle(SizeType.Absolute, 140));
        layout.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 100));
        AddRow(layout, "Server Siderio", _server);
        AddRow(layout, "Commessa", _job);
        AddRow(layout, "Cliente", _client);
        AddRow(layout, "Titolo", _title);
        AddRow(layout, "Note", _notes);
        var buttons = new FlowLayoutPanel { Dock = DockStyle.Fill };
        buttons.Controls.Add(_read);
        buttons.Controls.Add(_publish);
        layout.Controls.Add(buttons, 0, 5);
        layout.SetColumnSpan(buttons, 2);
        _log.Dock = DockStyle.Fill;
        layout.Controls.Add(_log, 0, 6);
        layout.SetColumnSpan(_log, 2);
        layout.RowStyles.Add(new RowStyle(SizeType.Absolute, 36));
        layout.RowStyles.Add(new RowStyle(SizeType.Absolute, 36));
        layout.RowStyles.Add(new RowStyle(SizeType.Absolute, 36));
        layout.RowStyles.Add(new RowStyle(SizeType.Absolute, 36));
        layout.RowStyles.Add(new RowStyle(SizeType.Absolute, 36));
        layout.RowStyles.Add(new RowStyle(SizeType.Absolute, 48));
        layout.RowStyles.Add(new RowStyle(SizeType.Percent, 100));
        Controls.Add(layout);

        _read.Click += (_, _) => ReadAssembly();
        _publish.Click += async (_, _) => await PublishAsync();
    }

    private static void AddRow(TableLayoutPanel layout, string label, Control field)
    {
        var row = layout.RowCount++;
        layout.Controls.Add(new Label { Text = label, TextAlign = ContentAlignment.MiddleLeft, Dock = DockStyle.Fill }, 0, row);
        field.Dock = DockStyle.Fill;
        layout.Controls.Add(field, 1, row);
    }

    private void ReadAssembly()
    {
        try
        {
            var draft = SolidEdgeBridge.ReadActiveAssembly();
            if (string.IsNullOrWhiteSpace(_job.Text)) _job.Text = draft.JobCode;
            if (string.IsNullOrWhiteSpace(_client.Text)) _client.Text = draft.ClientName;
            if (string.IsNullOrWhiteSpace(_title.Text)) _title.Text = draft.Title;
            Log($"Letto {draft.DocumentName}: {draft.Occurrences.Count} occorrenze, {draft.Configurations.Count} configurazioni.");
        }
        catch (Exception ex)
        {
            Log(ex.Message);
            MessageBox.Show(ex.Message, "Solid Edge", MessageBoxButtons.OK, MessageBoxIcon.Warning);
        }
    }

    private async Task PublishAsync()
    {
        if (string.IsNullOrWhiteSpace(_job.Text) || string.IsNullOrWhiteSpace(_client.Text) || string.IsNullOrWhiteSpace(_title.Text))
        {
            MessageBox.Show("Compila commessa, cliente e titolo.", "Siderio");
            return;
        }

        _publish.Enabled = false;
        try
        {
            Log("Lettura assieme da Solid Edge…");
            var draft = SolidEdgeBridge.ReadActiveAssembly();
            var work = Path.Combine(Path.GetTempPath(), "siderio-publish", Guid.NewGuid().ToString("N"));
            Directory.CreateDirectory(work);
            var stepPath = Path.Combine(work, Path.ChangeExtension(draft.DocumentName, ".stp"));
            Log("Esportazione STEP ufficiale (SaveAs)…");
            SolidEdgeBridge.ExportActiveAssemblyToStep(stepPath);

            var manifest = SolidEdgeBridge.ToManifest(draft, _job.Text.Trim(), _client.Text.Trim(), _title.Text.Trim(), _notes.Text.Trim());
            await SendAsync(_server.Text.Trim().TrimEnd('/'), stepPath, manifest);
            Log("Pubblicato. Il QR della commessa punta già a questa revisione.");
            MessageBox.Show("Modello pubblicato in officina.", "Siderio");
        }
        catch (Exception ex)
        {
            Log(ex.Message);
            MessageBox.Show(ex.Message, "Pubblicazione", MessageBoxButtons.OK, MessageBoxIcon.Error);
        }
        finally
        {
            _publish.Enabled = true;
        }
    }

    private async Task SendAsync(string server, string stepPath, JsonObject manifest)
    {
        using var client = new HttpClient { Timeout = TimeSpan.FromMinutes(30) };
        using var form = new MultipartFormDataContent();
        form.Add(new StringContent(JsonUtil.Serialize(manifest), Encoding.UTF8, "application/json"), "manifest");
        var bytes = await File.ReadAllBytesAsync(stepPath);
        var file = new ByteArrayContent(bytes);
        file.Headers.ContentType = new MediaTypeHeaderValue("application/octet-stream");
        form.Add(file, "step", Path.GetFileName(stepPath));
        var response = await client.PostAsync($"{server}/api/publish", form);
        var body = await response.Content.ReadAsStringAsync();
        if (!response.IsSuccessStatusCode)
        {
            throw new InvalidOperationException($"Server {response.StatusCode}: {body}");
        }
        Log(body);
    }

    private void Log(string message)
    {
        _log.AppendText($"[{DateTime.Now:HH:mm:ss}] {message}{Environment.NewLine}");
    }
}
