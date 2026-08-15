using System.Runtime.InteropServices;
using System.Text.Json;
using System.Text.Json.Nodes;

namespace Siderio.Publisher;

/// <summary>
/// Parla con Solid Edge già aperto, tramite API COM ufficiali.
/// Non apre né interpreta il file .ASM: lo fa Solid Edge.
/// </summary>
public static class SolidEdgeBridge
{
    public static PublishDraft ReadActiveAssembly()
    {
        var app = GetRunningSolidEdge();
        dynamic doc = app.ActiveDocument
            ?? throw new InvalidOperationException("Apri un assieme .ASM in Solid Edge, poi ripeti Pubblica.");

        string fullName = SafeString(() => doc.FullName) ?? "";
        string name = SafeString(() => doc.Name) ?? Path.GetFileName(fullName);
        if (!name.EndsWith(".asm", StringComparison.OrdinalIgnoreCase) &&
            !fullName.EndsWith(".asm", StringComparison.OrdinalIgnoreCase))
        {
            throw new InvalidOperationException("Il documento attivo non è un assieme (.ASM).");
        }

        var occurrences = WalkOccurrences(doc.Occurrences, "");
        var configurations = ReadConfigurations(doc, occurrences);

        return new PublishDraft
        {
            DocumentName = name,
            FullPath = fullName,
            Title = ReadProperty(doc, "Title") ?? Path.GetFileNameWithoutExtension(name),
            JobCode = ReadProperty(doc, "Project") ?? "",
            ClientName = ReadProperty(doc, "Company") ?? ReadProperty(doc, "Author") ?? "",
            Occurrences = occurrences,
            Configurations = configurations,
        };
    }

    public static string ExportActiveAssemblyToStep(string destPath)
    {
        var app = GetRunningSolidEdge();
        dynamic doc = app.ActiveDocument
            ?? throw new InvalidOperationException("Nessun documento attivo in Solid Edge.");
        Directory.CreateDirectory(Path.GetDirectoryName(destPath)!);
        if (File.Exists(destPath)) File.Delete(destPath);
        doc.SaveAs(destPath);
        if (!File.Exists(destPath))
        {
            throw new InvalidOperationException(
                "SaveAs non ha prodotto lo STEP. In Solid Edge verifica che l'esportazione STEP sia abilitata.");
        }
        return destPath;
    }

    public static JsonObject ToManifest(PublishDraft draft, string jobCode, string clientName, string title, string notes)
    {
        var parts = new JsonArray();
        var rootChildren = new JsonArray();
        foreach (var occ in draft.Occurrences)
        {
            parts.Add(new JsonObject
            {
                ["id"] = occ.Id,
                ["name"] = occ.Name,
                ["triangleCount"] = 0,
                ["color"] = new JsonArray(0.72, 0.75, 0.78),
            });
            rootChildren.Add(new JsonObject
            {
                ["id"] = occ.Id,
                ["name"] = occ.Name,
                ["partId"] = occ.Id,
                ["children"] = new JsonArray(),
            });
        }

        var configs = new JsonArray();
        foreach (var config in draft.Configurations)
        {
            configs.Add(new JsonObject
            {
                ["name"] = config.Name,
                ["visibleNames"] = new JsonArray(config.VisibleNames.Select(n => JsonValue.Create(n)).ToArray()),
                ["explode"] = config.Name.Contains("esplos", StringComparison.OrdinalIgnoreCase) ? 0.65 : 0,
            });
        }

        return new JsonObject
        {
            ["jobCode"] = jobCode,
            ["clientName"] = clientName,
            ["title"] = title,
            ["notes"] = notes,
            ["source"] = new JsonObject
            {
                ["application"] = "Solid Edge",
                ["document"] = draft.DocumentName,
                ["fullPath"] = draft.FullPath,
            },
            ["assembly"] = new JsonObject
            {
                ["unit"] = "mm",
                ["root"] = new JsonObject
                {
                    ["id"] = "root",
                    ["name"] = Path.GetFileNameWithoutExtension(draft.DocumentName),
                    ["partId"] = null,
                    ["children"] = rootChildren,
                },
                ["parts"] = parts,
            },
            ["configurations"] = configs,
        };
    }

    private static dynamic GetRunningSolidEdge()
    {
        var instance = ComHelper.GetActiveObject("SolidEdge.Application");
        if (instance == null)
        {
            throw new InvalidOperationException(
                "Solid Edge non è in esecuzione. Aprilo con l'assieme, poi premi di nuovo Pubblica.");
        }
        return instance;
    }

    private static List<OccurrenceInfo> WalkOccurrences(dynamic occurrences, string prefix)
    {
        var list = new List<OccurrenceInfo>();
        int count = occurrences.Count;
        for (int i = 1; i <= count; i++)
        {
            dynamic occ = occurrences.Item(i);
            string name = SafeString(() => occ.Name) ?? $"Occurrence_{i}";
            string id = string.IsNullOrEmpty(prefix) ? name : $"{prefix}/{name}";
            bool visible = true;
            try { visible = Convert.ToBoolean(occ.Visible); } catch { /* alcune occorrenze non espongono Visible */ }
            list.Add(new OccurrenceInfo { Id = id, Name = name, Visible = visible });
            try
            {
                dynamic sub = occ.Suboccurrences;
                if (sub != null && sub.Count > 0)
                {
                    list.AddRange(WalkOccurrences(sub, id));
                }
            }
            catch
            {
                // parte foglia
            }
        }
        return list;
    }

    private static List<ConfigurationInfo> ReadConfigurations(dynamic doc, List<OccurrenceInfo> fallback)
    {
        var result = new List<ConfigurationInfo>();
        try
        {
            dynamic configs = doc.Configurations;
            int count = configs.Count;

            for (int i = 1; i <= count; i++)
            {
                dynamic cfg = configs.Item(i);
                string name = SafeString(() => cfg.Name) ?? $"CFG_{i}";
                try { cfg.Apply(); } catch { try { cfg.Activate(); } catch { /* versioni diverse */ } }
                var visible = WalkOccurrences(doc.Occurrences, "")
                    .Where(o => o.Visible)
                    .Select(o => o.Name)
                    .Distinct()
                    .ToList();
                result.Add(new ConfigurationInfo { Name = name, VisibleNames = visible });
            }
        }
        catch
        {
            result.Add(new ConfigurationInfo
            {
                Name = "Completo",
                VisibleNames = fallback.Where(o => o.Visible).Select(o => o.Name).ToList(),
            });
        }
        return result;
    }

    private static string? ReadProperty(dynamic doc, string key)
    {
        try
        {
            dynamic props = doc.Properties;
            dynamic summary = props.Item("SummaryInformation");
            return SafeString(() => summary.Item(key).Value);
        }
        catch
        {
            return null;
        }
    }

    private static string? SafeString(Func<object?> getter)
    {
        try
        {
            var value = getter();
            return value?.ToString();
        }
        catch
        {
            return null;
        }
    }
}

public sealed class PublishDraft
{
    public string DocumentName { get; set; } = "";
    public string FullPath { get; set; } = "";
    public string Title { get; set; } = "";
    public string JobCode { get; set; } = "";
    public string ClientName { get; set; } = "";
    public List<OccurrenceInfo> Occurrences { get; set; } = [];
    public List<ConfigurationInfo> Configurations { get; set; } = [];
}

public sealed class OccurrenceInfo
{
    public string Id { get; set; } = "";
    public string Name { get; set; } = "";
    public bool Visible { get; set; } = true;
}

public sealed class ConfigurationInfo
{
    public string Name { get; set; } = "";
    public List<string> VisibleNames { get; set; } = [];
}

internal static class ComHelper
{
    [DllImport("ole32.dll")]
    private static extern int CLSIDFromProgID([MarshalAs(UnmanagedType.LPWStr)] string lpszProgID, out Guid pclsid);

    [DllImport("oleaut32.dll")]
    private static extern int GetActiveObject(ref Guid rclsid, IntPtr reserved,
        [MarshalAs(UnmanagedType.IUnknown)] out object ppunk);

    public static object? GetActiveObject(string progId)
    {
        if (CLSIDFromProgID(progId, out var clsid) != 0) return null;
        return GetActiveObject(ref clsid, IntPtr.Zero, out var obj) == 0 ? obj : null;
    }
}

internal static class JsonUtil
{
    public static string Serialize(JsonObject node) =>
        node.ToJsonString(new JsonSerializerOptions { WriteIndented = true });
}
