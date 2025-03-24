{ pkgs }: {
  deps = [
    pkgs.python311Packages.pip
    pkgs.python311Packages.uvicorn
    pkgs.python311
    pkgs.ffmpeg
  ];
}
