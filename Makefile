image:
	docker build -t yuva-ubuntu containers/ubuntu

dev: image
	docker compose up --build
