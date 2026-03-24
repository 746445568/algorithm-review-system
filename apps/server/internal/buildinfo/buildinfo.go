package buildinfo

type Info struct {
	Version string `json:"version"`
	Commit  string `json:"commit"`
}

var (
	Version = "1.0.0-dev"
	Commit  = "dev"
)

func Get() Info {
	return Info{
		Version: Version,
		Commit:  Commit,
	}
}
