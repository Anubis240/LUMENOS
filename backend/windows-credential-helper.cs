using System;
using System.Security.Cryptography;

internal static class LumenCredentialHelper
{
    private static int Main(string[] args)
    {
        if (args.Length != 1 || (args[0] != "protect" && args[0] != "unprotect")) return 2;
        byte[] input = null;
        byte[] output = null;
        try
        {
            input = Convert.FromBase64String(Console.In.ReadToEnd());
            output = args[0] == "protect"
                ? ProtectedData.Protect(input, null, DataProtectionScope.CurrentUser)
                : ProtectedData.Unprotect(input, null, DataProtectionScope.CurrentUser);
            Console.Out.Write(Convert.ToBase64String(output));
            return 0;
        }
        catch (Exception error)
        {
            Console.Error.Write(error.GetType().Name + ": " + error.Message);
            return 1;
        }
        finally
        {
            if (input != null) Array.Clear(input, 0, input.Length);
            if (output != null) Array.Clear(output, 0, output.Length);
        }
    }
}
