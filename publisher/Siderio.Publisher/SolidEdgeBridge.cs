using System.Reflection;
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

        object? matTable = null;
        try { matTable = app.GetMaterialTable(); } catch { /* versioni senza tabella */ }

        var occurrences = WalkOccurrences(app, matTable, (object)doc.Occurrences, "", readMaterial: true);
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
            var color = occ.Color ?? [0.72, 0.75, 0.78];
            var part = new JsonObject
            {
                ["id"] = occ.Id,
                ["name"] = occ.Name,
                ["triangleCount"] = 0,
                ["color"] = new JsonArray(color[0], color[1], color[2]),
            };
            if (occ.Material != null)
            {
                var material = new JsonObject { ["name"] = occ.Material.Name };
                if (occ.Material.Density is { } density) material["density"] = density;
                if (occ.Material.Opacity is { } opacity) material["opacity"] = opacity;
                if (occ.Color != null)
                {
                    material["color"] = new JsonArray(occ.Color[0], occ.Color[1], occ.Color[2]);
                }
                part["material"] = material;
            }
            parts.Add(part);
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

    private static List<OccurrenceInfo> WalkOccurrences(
        dynamic app,
        object? matTable,
        object occurrencesObj,
        string prefix,
        bool readMaterial)
    {
        dynamic occurrences = occurrencesObj;
        var list = new List<OccurrenceInfo>();
        int count = occurrences.Count;
        for (int i = 1; i <= count; i++)
        {
            dynamic occ = occurrences.Item(i);
            string name = SafeString(() => occ.Name) ?? $"Occurrence_{i}";
            string id = string.IsNullOrEmpty(prefix) ? name : $"{prefix}/{name}";
            bool visible = true;
            try { visible = Convert.ToBoolean(occ.Visible); } catch { /* alcune occorrenze non espongono Visible */ }
            var info = new OccurrenceInfo { Id = id, Name = name, Visible = visible };
            if (readMaterial) ReadOccurrenceMaterial(app, matTable, occ, info);
            list.Add(info);
            try
            {
                object? sub = occ.Suboccurrences;
                if (sub != null)
                {
                    dynamic subDyn = sub;
                    if (subDyn.Count > 0)
                    {
                        list.AddRange(WalkOccurrences(app, matTable, sub, id, readMaterial));
                    }
                }
            }
            catch
            {
                // parte foglia
            }
        }
        return list;
    }

    private static void ReadOccurrenceMaterial(dynamic app, object? matTable, dynamic occ, OccurrenceInfo info)
    {
        object? doc = null;
        try { doc = occ.OccurrenceDocument; } catch { /* occorrenza senza documento */ }

        string? matName = null;
        if (matTable != null && doc != null)
        {
            matName = InvokeOutString(matTable, "GetCurrentMaterialName", doc);
        }

        double? density = null;
        if (matTable != null && !string.IsNullOrWhiteSpace(matName))
        {
            density = ToGcm3(InvokeOutNumber(matTable, "GetMatPropValue", matName, 23));
        }
        if (density == null && doc != null)
        {
            density = ReadDensityVariable(doc);
        }

        object? style = null;
        try { style = occ.FaceStyle; } catch { /* nessuno stile in assieme */ }
        if (style == null && matTable != null && !string.IsNullOrWhiteSpace(matName) && doc != null)
        {
            var styleName = InvokeOutString(matTable, "GetMatPropValue", matName, 20);
            if (!string.IsNullOrWhiteSpace(styleName)) style = FindFaceStyle(doc, app, styleName);
        }
        if (style == null && doc != null) style = ReadBodyFaceStyle(doc);

        double? opacity = null;
        double[]? color = null;
        if (style != null)
        {
            try { opacity = Convert.ToDouble(((dynamic)style).Opacity); } catch { /* opacity assente */ }
            color = ReadStyleColor(style);
        }

        if (string.IsNullOrWhiteSpace(matName) && density == null && opacity == null && color == null) return;
        info.Material = new MaterialInfo
        {
            Name = matName?.Trim() ?? "",
            Density = density,
            Opacity = opacity is >= 0 and <= 1 ? opacity : opacity is > 1 and <= 100 ? opacity / 100.0 : opacity,
        };
        info.Color = color;
    }

    private static double? ReadDensityVariable(object doc)
    {
        try
        {
            dynamic variables = ((dynamic)doc).Variables;
            foreach (var key in new[] { "PhysicalProperties_Density", "Density", "Densità" })
            {
                try
                {
                    dynamic variable = variables.Item(key);
                    return ToGcm3(Convert.ToDouble(variable.Value));
                }
                catch { /* variabile assente */ }
            }
        }
        catch { /* niente tabella variabili */ }
        return null;
    }

    private static object? FindFaceStyle(object doc, dynamic app, string styleName)
    {
        foreach (var source in new object?[] { doc, TryGet(() => (object)app.ActiveDocument) })
        {
            if (source == null) continue;
            try
            {
                dynamic styles = ((dynamic)source).FaceStyles;
                try { return styles.Item(styleName); } catch { /* nome non in questa collezione */ }
                int count = styles.Count;
                for (int i = 1; i <= count; i++)
                {
                    dynamic item = styles.Item(i);
                    var name = SafeString(() => item.StyleName) ?? SafeString(() => item.Name);
                    if (string.Equals(name, styleName, StringComparison.OrdinalIgnoreCase)) return item;
                }
            }
            catch { /* documento senza FaceStyles */ }
        }
        return null;
    }

    private static object? ReadBodyFaceStyle(object doc)
    {
        try
        {
            dynamic models = ((dynamic)doc).Models;
            if (models.Count < 1) return null;
            dynamic body = models.Item(1).Body;
            try { return body.Style; } catch { return body.FaceStyle; }
        }
        catch
        {
            return null;
        }
    }

    private static double[]? ReadStyleColor(object style)
    {
        try
        {
            dynamic s = style;
            var r = ColorComponent(TryNumber(() => s.DiffuseRed) ?? TryNumber(() => s.AmbientRed));
            var g = ColorComponent(TryNumber(() => s.DiffuseGreen) ?? TryNumber(() => s.AmbientGreen));
            var b = ColorComponent(TryNumber(() => s.DiffuseBlue) ?? TryNumber(() => s.AmbientBlue));
            if (r == null || g == null || b == null) return null;
            return [r.Value, g.Value, b.Value];
        }
        catch
        {
            return null;
        }
    }

    private static double? ColorComponent(double? value)
    {
        if (value == null || !double.IsFinite(value.Value)) return null;
        var n = value.Value;
        if (n > 1.5) n /= 255.0;
        return Math.Clamp(n, 0, 1);
    }

    /// <summary>SE usa spesso kg/m³ (7850); in Siderio la densità è g/cm³ (7.85).</summary>
    private static double? ToGcm3(double? raw)
    {
        if (raw == null || !double.IsFinite(raw.Value) || raw.Value <= 0) return null;
        var value = raw.Value;
        if (value > 50) value /= 1000.0;
        return value is > 0.01 and < 30 ? value : null;
    }

    private static string? InvokeOutString(object target, string method, params object?[] inputs)
    {
        var value = InvokeOut(target, method, inputs);
        var text = value?.ToString()?.Trim();
        return string.IsNullOrWhiteSpace(text) ? null : text;
    }

    private static double? InvokeOutNumber(object target, string method, params object?[] inputs)
    {
        var value = InvokeOut(target, method, inputs);
        try
        {
            if (value == null) return null;
            return Convert.ToDouble(value);
        }
        catch
        {
            return null;
        }
    }

    private static object? InvokeOut(object target, string method, object?[] inputs)
    {
        var args = new object?[inputs.Length + 1];
        inputs.CopyTo(args, 0);
        args[^1] = "";
        var mods = new ParameterModifier[1];
        mods[0] = new ParameterModifier(args.Length);
        mods[0][args.Length - 1] = true;
        try
        {
            target.GetType().InvokeMember(
                method,
                BindingFlags.InvokeMethod | BindingFlags.Public | BindingFlags.Instance,
                null,
                target,
                args!,
                mods,
                null,
                null);
            return args[^1];
        }
        catch
        {
            try
            {
                return target.GetType().InvokeMember(
                    method,
                    BindingFlags.InvokeMethod | BindingFlags.Public | BindingFlags.Instance,
                    null,
                    target,
                    inputs!);
            }
            catch
            {
                return null;
            }
        }
    }

    private static object? TryGet(Func<object?> getter)
    {
        try { return getter(); } catch { return null; }
    }

    private static double? TryNumber(Func<object?> getter)
    {
        try
        {
            var value = getter();
            return value == null ? null : Convert.ToDouble(value);
        }
        catch
        {
            return null;
        }
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
                var snapshot = WalkOccurrences(null!, null, (object)doc.Occurrences, "", readMaterial: false);
                var visible = snapshot
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
    public MaterialInfo? Material { get; set; }
    public double[]? Color { get; set; }
}

public sealed class MaterialInfo
{
    public string Name { get; set; } = "";
    public double? Density { get; set; }
    public double? Opacity { get; set; }
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
