package buildinfo

type Info struct {
	Version    string `json:"version"`
	Commit     string `json:"commit"`
	APIVersion string `json:"apiVersion"`
}

var (
	Version    = "2.0.0-dev"
	Commit     = "dev"
	APIVersion = "1"
)

func Get() Info {
	return Info{
		Version:    Version,
		Commit:     Commit,
		APIVersion: APIVersion,
	}
}
