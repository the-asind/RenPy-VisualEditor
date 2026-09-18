from app.main import app


def test_public_api_uses_plotmio_product_name():
    assert app.title == "Plotmio"
    assert "Ren'Py" in app.description
