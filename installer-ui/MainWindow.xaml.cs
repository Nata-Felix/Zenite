using System;
using System.ComponentModel;
using System.Diagnostics;
using System.IO;
using System.Linq;
using System.Reflection;
using System.Threading.Tasks;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Input;
using System.Windows.Media;
using System.Windows.Media.Animation;
using System.Windows.Shapes;

namespace ZeniteInstaller
{
    // Fluxo: escolher modo e pasta -> extrair o setup do electron-builder para o %TEMP% ->
    // rodá-lo em silêncio (/S /allusers|/currentuser /D=pasta) -> acompanhar pelo tamanho da pasta.
    // O setup é o mesmo do auto-update, então instalar por aqui ou por ele dá no mesmo.
    public partial class MainWindow : Window
    {
        const string AppDir = "Zenite";
        const string AppExe = "Zenite.exe";

        readonly string version = "";
        readonly long appBytes;
        string mode = "me";
        string installDir;
        bool installing;

        static readonly string AllDir = System.IO.Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ProgramFiles), AppDir);
        static readonly string MeDir = System.IO.Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "Programs", AppDir);

        static readonly string[] StepTitles = { "Destino", "Instalação", "Pronto" };
        static readonly string[] StepSubs = { "Para quem e onde", "Copiando arquivos", "Tudo certo" };
        static readonly string[] CheckLabels = { "Fechando o Zênite aberto", "Removendo a versão anterior", "Copiando arquivos", "Criando atalhos" };

        public MainWindow()
        {
            InitializeComponent();
            using (var s = Assembly.GetExecutingAssembly().GetManifestResourceStream("build-info.txt"))
            using (var r = new StreamReader(s))
            {
                var parts = r.ReadToEnd().Trim().Split('|');
                version = parts[0];
                appBytes = long.Parse(parts[1]);
            }
            VersionText.Text = "Zênite " + version;
            MeTitle.Text = "Só para mim (" + Environment.UserName + ")";
            Stars(SideStars, 250, 578, 40);
            Stars(FinStars, 898, 578, 70);
            BuildSteps(1);
            BuildChecks(-1);

            // Já instalado? Começa no mesmo modo, para atualizar em vez de duplicar.
            mode = File.Exists(System.IO.Path.Combine(AllDir, AppExe)) && !File.Exists(System.IO.Path.Combine(MeDir, AppExe)) ? "all" : "me";
            SetMode(mode);
            CompositionTarget.Rendering += MovePlanets;
            ContentRendered += Shot;
        }

        // Para conferir o visual sem instalar: Zenite-Instalador.exe --shot saida.png [1|2|3]
        async void Shot(object sender, EventArgs e)
        {
            var a = Environment.GetCommandLineArgs();
            int i = Array.IndexOf(a, "--shot");
            if (i < 0 || i + 1 >= a.Length) return;
            var page = i + 2 < a.Length ? a[i + 2] : "1";
            if (page != "1") { P1.Visibility = Visibility.Collapsed; P2.Visibility = Visibility.Visible; BuildSteps(2); BuildChecks(2); }
            if (page == "3") { BuildSteps(3); FinText.Text = $"Versão {version} em {installDir}"; P3.Visibility = Visibility.Visible; }
            await Task.Delay(800);
            if (page == "2") SetProgress(58, "Copiando arquivos…");
            await Task.Delay(300);
            var el = (FrameworkElement)Content;
            var bmp = new System.Windows.Media.Imaging.RenderTargetBitmap((int)el.ActualWidth, (int)el.ActualHeight, 96, 96, PixelFormats.Pbgra32);
            bmp.Render(el);
            var enc = new System.Windows.Media.Imaging.PngBitmapEncoder();
            enc.Frames.Add(System.Windows.Media.Imaging.BitmapFrame.Create(bmp));
            using (var fs = File.Create(a[i + 1])) enc.Save(fs);
            Close();
        }

        // ---------- visual ----------

        static void Stars(Canvas c, double w, double h, int n)
        {
            var rnd = new Random(7 + n);
            for (int i = 0; i < n; i++)
            {
                var e = new Ellipse { Width = 2, Height = 2, Fill = Brushes.White, Opacity = 0.15 + rnd.NextDouble() * 0.6 };
                Canvas.SetLeft(e, rnd.NextDouble() * w);
                Canvas.SetTop(e, rnd.NextDouble() * h);
                c.Children.Add(e);
            }
        }

        static Brush B(string hex) => (Brush)new BrushConverter().ConvertFromString(hex);
        static readonly FontFamily Icons = new FontFamily("Segoe Fluent Icons, Segoe MDL2 Assets");

        void BuildSteps(int now)
        {
            Steps.Children.Clear();
            for (int i = 0; i < 3; i++)
            {
                int k = i + 1;
                bool done = k < now, cur = k == now;
                var row = new Grid { Margin = new Thickness(0, 0, 0, i < 2 ? 26 : 0) };
                row.ColumnDefinitions.Add(new ColumnDefinition { Width = GridLength.Auto });
                row.ColumnDefinitions.Add(new ColumnDefinition());
                if (i < 2)
                {
                    var line = new Rectangle { Width = 2, Fill = done ? B("#6D5CFF") : B("#34397A"), HorizontalAlignment = HorizontalAlignment.Center, Margin = new Thickness(0, 34, 0, -24) };
                    row.Children.Add(line);
                }
                var dot = new Border
                {
                    Width = 32, Height = 32, CornerRadius = new CornerRadius(16), BorderThickness = new Thickness(2), VerticalAlignment = VerticalAlignment.Top,
                    BorderBrush = cur ? B("#8A7BFF") : done ? B("#6D5CFF") : B("#34397A"),
                    Background = cur || done ? B("#6D5CFF") : B("#0C0E26"),
                    Child = done
                        ? new TextBlock { Text = "", FontFamily = Icons, FontSize = 12, Foreground = Brushes.White, HorizontalAlignment = HorizontalAlignment.Center, VerticalAlignment = VerticalAlignment.Center }
                        : new TextBlock { Text = k.ToString(), FontSize = 13, FontWeight = FontWeights.SemiBold, Foreground = cur ? Brushes.White : B("#6B70A6"), HorizontalAlignment = HorizontalAlignment.Center, VerticalAlignment = VerticalAlignment.Center },
                };
                if (cur) dot.Effect = new System.Windows.Media.Effects.DropShadowEffect { Color = Color.FromRgb(0x6D, 0x5C, 0xFF), BlurRadius = 18, ShadowDepth = 0, Opacity = 0.9 };
                row.Children.Add(dot);
                var txt = new StackPanel { Margin = new Thickness(14, 2, 0, 0) };
                txt.Children.Add(new TextBlock { Text = StepTitles[i], FontWeight = FontWeights.SemiBold, Foreground = cur || done ? B("#EEF0FF") : B("#6B70A6") });
                txt.Children.Add(new TextBlock { Text = StepSubs[i], FontSize = 12, Foreground = cur ? B("#9AA0D0") : B("#6B70A6") });
                Grid.SetColumn(txt, 1);
                row.Children.Add(txt);
                Steps.Children.Add(row);
            }
        }

        // state: índice da etapa em andamento; as anteriores ficam com ✓. skip: etapas puladas (sem versão anterior).
        void BuildChecks(int running, int skip = -1)
        {
            Checks.Children.Clear();
            for (int i = 0; i < CheckLabels.Length; i++)
            {
                if (i == skip) continue;
                bool ok = i < running, run = i == running;
                var row = new StackPanel { Orientation = Orientation.Horizontal, Margin = new Thickness(0, Checks.Children.Count == 0 ? 0 : 10, 0, 0) };
                FrameworkElement mark;
                if (ok)
                    mark = new Border { Width = 18, Height = 18, CornerRadius = new CornerRadius(9), Background = B("#6D5CFF"), Child = new TextBlock { Text = "", FontFamily = Icons, FontSize = 9, Foreground = Brushes.White, HorizontalAlignment = HorizontalAlignment.Center, VerticalAlignment = VerticalAlignment.Center } };
                else if (run)
                {
                    var e = new Ellipse { Width = 18, Height = 18, Stroke = B("#8A7BFF"), StrokeThickness = 2, StrokeDashArray = new DoubleCollection { 18, 7 }, RenderTransformOrigin = new Point(0.5, 0.5) };
                    var rot = new RotateTransform();
                    e.RenderTransform = rot;
                    rot.BeginAnimation(RotateTransform.AngleProperty, new DoubleAnimation(0, 360, TimeSpan.FromSeconds(0.8)) { RepeatBehavior = RepeatBehavior.Forever });
                    mark = e;
                }
                else
                    mark = new Ellipse { Width = 18, Height = 18, Stroke = B("#34397A"), StrokeThickness = 2 };
                row.Children.Add(mark);
                row.Children.Add(new TextBlock { Text = CheckLabels[i], Margin = new Thickness(12, 0, 0, 0), FontSize = 13.5, VerticalAlignment = VerticalAlignment.Center, Foreground = run ? B("#EEF0FF") : ok ? B("#9AA0D0") : B("#6B70A6") });
                Checks.Children.Add(row);
            }
        }

        // Planetas nas órbitas inclinadas; o que está atrás do sol passa atrás dele.
        readonly Ellipse[] planets = new Ellipse[3];
        static readonly (double rx, double ry, double sec, double off, double size, string color)[] Orbits =
        {
            (165, 48, 9, 0, 14, "#8A7BFF"), (110, 32, 6, 2, 10, "#FFB347"), (210, 62, 14, 4, 8, "#7FD0FF"),
        };
        void MovePlanets(object sender, EventArgs e)
        {
            if (P2.Visibility != Visibility.Visible) return;
            if (planets[0] == null)
                for (int i = 0; i < 3; i++)
                {
                    var o = Orbits[i];
                    var c = (Color)ColorConverter.ConvertFromString(o.color);
                    planets[i] = new Ellipse { Width = o.size, Height = o.size, Fill = new SolidColorBrush(c), Effect = new System.Windows.Media.Effects.DropShadowEffect { Color = c, BlurRadius = 12, ShadowDepth = 0, Opacity = 1 } };
                    Orbit.Children.Add(planets[i]);
                }
            double t = Environment.TickCount / 1000.0, tilt = -12 * Math.PI / 180, cx = 284, cy = 85;
            for (int i = 0; i < 3; i++)
            {
                var o = Orbits[i];
                double a = t / o.sec * 2 * Math.PI + o.off, x = o.rx * Math.Cos(a), y = o.ry * Math.Sin(a);
                Canvas.SetLeft(planets[i], cx + x * Math.Cos(tilt) - y * Math.Sin(tilt) - o.size / 2);
                Canvas.SetTop(planets[i], cy + x * Math.Sin(tilt) + y * Math.Cos(tilt) - o.size / 2);
                Panel.SetZIndex(planets[i], Math.Sin(a) > 0 ? 2 : 0);
            }
        }

        void SetMode(string m)
        {
            mode = m;
            installDir = m == "all" ? AllDir : MeDir;
            foreach (var (card, radio, on) in new[] { (CardAll, RadioAll, m == "all"), (CardMe, RadioMe, m == "me") })
            {
                card.BorderBrush = on ? B("#8A7BFF") : B("#262A5C");
                card.Background = on
                    ? new LinearGradientBrush(Color.FromRgb(0x2A, 0x23, 0x80), Color.FromRgb(0x16, 0x15, 0x4A), 45)
                    : B("#0F1130");
                card.Effect = on ? new System.Windows.Media.Effects.DropShadowEffect { Color = Color.FromRgb(0x6D, 0x5C, 0xFF), BlurRadius = 30, ShadowDepth = 0, Opacity = 0.35 } : null;
                radio.Stroke = on ? Brushes.White : B("#34397A");
                radio.Fill = on ? new RadialGradientBrush(new GradientStopCollection { new GradientStop(Colors.White, 0), new GradientStop(Colors.White, 0.42), new GradientStop(Color.FromRgb(0x6D, 0x5C, 0xFF), 0.5) }) : Brushes.Transparent;
            }
            RefreshPath();
        }

        void RefreshPath()
        {
            PathText.Text = installDir;
            var exe = System.IO.Path.Combine(installDir, AppExe);
            if (File.Exists(exe))
            {
                var v = (FileVersionInfo.GetVersionInfo(exe).ProductVersion ?? "").Split('.');
                var old = string.Join(".", v.Take(3));
                NoteText.Text = old == version
                    ? $"O Zênite {version} já está instalado aqui. Ele será reinstalado; suas contas e canvas continuam."
                    : $"O Zênite {old} já está instalado aqui. Ele será atualizado para a {version}; suas contas e canvas continuam.";
                Note.Visibility = Visibility.Visible;
            }
            else Note.Visibility = Visibility.Hidden;
        }

        // ---------- eventos ----------

        void Drag(object sender, MouseButtonEventArgs e)
        {
            if (e.ButtonState == MouseButtonState.Pressed && !(e.OriginalSource is Button)) try { DragMove(); } catch { }
        }
        void MinClick(object sender, RoutedEventArgs e) => WindowState = WindowState.Minimized;
        void CloseClick(object sender, RoutedEventArgs e) { if (!installing) Close(); }
        void PickCard(object sender, MouseButtonEventArgs e) => SetMode((string)((FrameworkElement)sender).Tag);

        void ChangeFolder(object sender, RoutedEventArgs e)
        {
            using (var d = new System.Windows.Forms.FolderBrowserDialog { Description = "Pasta onde o Zênite será instalado", SelectedPath = Directory.Exists(installDir) ? installDir : System.IO.Path.GetDirectoryName(installDir) })
            {
                if (d.ShowDialog() != System.Windows.Forms.DialogResult.OK) return;
                var p = d.SelectedPath.TrimEnd('\\');
                // Igual ao setup assistido: a pasta sempre termina com o nome do app.
                installDir = p.EndsWith("\\" + AppDir, StringComparison.OrdinalIgnoreCase) ? p : System.IO.Path.Combine(p, AppDir);
                RefreshPath();
            }
        }

        void BackToStart(object sender, RoutedEventArgs e)
        {
            ErrorText.Visibility = ErrorActions.Visibility = Visibility.Collapsed;
            P2.Visibility = Visibility.Collapsed;
            P1.Visibility = Visibility.Visible;
            BuildSteps(1);
            RefreshPath();
        }

        async void Install(object sender, RoutedEventArgs e)
        {
            P1.Visibility = Visibility.Collapsed;
            P2.Visibility = Visibility.Visible;
            BuildSteps(2);
            installing = true;
            CloseBtn.IsEnabled = false;
            string error = null;
            try { error = await Run(); }
            catch (Exception ex) { error = ex.Message; }
            installing = false;
            CloseBtn.IsEnabled = true;
            if (error == null)
            {
                BuildSteps(3);
                FinText.Text = $"Versão {version} em {installDir}";
                P3.Visibility = Visibility.Visible;
            }
            else
            {
                ErrorText.Text = error;
                ErrorText.Visibility = ErrorActions.Visibility = Visibility.Visible;
            }
        }

        void SetProgress(double p, string status)
        {
            p = Math.Max(0, Math.Min(100, p));
            Fill.Width = ((FrameworkElement)Fill.Parent).ActualWidth * p / 100;
            PctText.Text = (int)p + "%";
            StatusText.Text = status;
        }

        async Task<string> Run()
        {
            bool hadOld = File.Exists(System.IO.Path.Combine(installDir, AppExe));
            int skip = hadOld ? -1 : 1;
            BuildChecks(0, skip);
            SetProgress(0, "Preparando…");

            var setup = System.IO.Path.Combine(System.IO.Path.GetTempPath(), $"Zenite-Setup-{version}-{Guid.NewGuid():N}.exe");
            await Task.Run(() =>
            {
                using (var src = Assembly.GetExecutingAssembly().GetManifestResourceStream("setup.exe"))
                using (var dst = File.Create(setup)) src.CopyTo(dst);
            });

            var psi = new ProcessStartInfo(setup, $"/S {(mode == "all" ? "/allusers" : "/currentuser")} /D={installDir}") { UseShellExecute = true };
            if (mode == "all") psi.Verb = "runas";
            Process proc;
            try { proc = Process.Start(psi); }
            catch (Win32Exception ex) when (ex.NativeErrorCode == 1223)
            {
                File.Delete(setup);
                return "A permissão de administrador foi negada. Escolha \"Só para mim\" ou tente de novo.";
            }

            // Etapas pelo que dá para ver de fora: o Zênite fechando, a pasta esvaziando (desinstala a
            // versão anterior) e enchendo de novo até o tamanho do app.
            int stage = 0;
            bool emptied = !hadOld;
            while (!proc.HasExited)
            {
                await Task.Delay(250);
                long size = await Task.Run(() => DirSize(installDir));
                double frac = appBytes > 0 ? (double)size / appBytes : 0;
                if (stage == 0 && Process.GetProcessesByName(System.IO.Path.GetFileNameWithoutExtension(AppExe)).Length == 0) stage = hadOld ? 1 : 2;
                if (stage == 1 && (frac < 0.3 || !File.Exists(System.IO.Path.Combine(installDir, AppExe)))) { emptied = true; stage = 2; }
                if (stage == 2 && emptied && frac >= 0.97) stage = 3;
                switch (stage)
                {
                    case 0: SetProgress(2, "Fechando o Zênite…"); break;
                    case 1: SetProgress(4 + (1 - Math.Min(frac, 1)) * 6, "Removendo a versão anterior…"); break;
                    case 2: SetProgress(10 + (emptied ? frac : 0) * 85, "Copiando arquivos…"); break;
                    case 3: SetProgress(97, "Criando atalhos…"); break;
                }
                BuildChecksIfChanged(stage, skip);
            }
            try { File.Delete(setup); } catch { }

            if (proc.ExitCode != 0 || !File.Exists(System.IO.Path.Combine(installDir, AppExe)))
                return $"A instalação não terminou (código {proc.ExitCode}). Feche o Zênite, se estiver aberto, e tente de novo.";
            BuildChecks(CheckLabels.Length, skip);
            SetProgress(100, "Pronto");
            await Task.Delay(500);
            return null;
        }

        int shownStage = -1;
        void BuildChecksIfChanged(int stage, int skip)
        {
            if (stage == shownStage) return;
            shownStage = stage;
            BuildChecks(stage, skip);
        }

        static long DirSize(string dir)
        {
            try { return Directory.Exists(dir) ? new DirectoryInfo(dir).EnumerateFiles("*", SearchOption.AllDirectories).Sum(f => { try { return f.Length; } catch { return 0L; } }) : 0; }
            catch { return 0; }
        }

        void OpenFolder(object sender, RoutedEventArgs e) => Process.Start("explorer.exe", $"\"{installDir}\"");

        void Launch(object sender, RoutedEventArgs e)
        {
            Process.Start(new ProcessStartInfo(System.IO.Path.Combine(installDir, AppExe)) { UseShellExecute = true, WorkingDirectory = installDir });
            Close();
        }
    }
}
